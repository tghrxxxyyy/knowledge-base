# 动态链接与PLT-GOT延迟绑定

> 对应 Bryant & O'Hallaron《CSAPP》第 7.13 节；Levine《Linkers and Loaders》第 10 章；glibc `ld.so` 源码。

## 一、背景与挑战

把 libc 等做成共享对象（`.so`）可在多进程间共享物理页，但外部函数地址在加载前未知。若加载期解析全部符号，启动慢且多数函数永不调用，纯属浪费。惰性绑定（lazy binding）把地址解析推迟到「首次调用」，兼顾启动速度与内存。但惰性绑定也引入安全与调试权衡：GOT 必须可写以支持运行期回填，这恰好是 GOT 劫持攻击面；调试器下步过未解析函数会有一次「莫名跳转」。

另一个常被忽略的挑战是「解析器自身的可重入性与线程安全」：多线程程序可能同时首次调用不同函数，`_dl_runtime_resolve` 必须在持锁的前提下修改 GOT，且不能在被信号打断时留下半更新状态。此外，符号解析的查表顺序（本模块 → 依赖链 → 全局范围）决定了同名符号被谁「截获」，这是 LD_PRELOAD 与符号插入（interposition）的机制基础。

## 二、核心原理

采用过程链接表（PLT，代码桩）与全局偏移表（GOT，数据表）解耦调用与解析。首次调用 `foo` 时，PLT 经 `GOT[2]`（存 `_dl_runtime_resolve` 入口）跳入动态链接器，链接器查符号、算出真实地址并回填 `GOT[2+i]`，随后直接跳到 `foo`；之后调用经 `GOT[2+i]` 直接跳转，跳过解析。`GOT[1]` 存 `link_map`（本模块依赖信息）。这一机制让「调用」与「绑定」分离。`GOT[0]` 通常存 `.dynamic` 段地址，供解析器使用。

`link_map` 是一条按加载顺序组织的链表，解析器沿链查找符号定义，顺序即搜索域（本模块、依赖库按广度优先、最后全局）。这正是「同名符号被谁先找到就用谁」规则的实现，也是了解 LD_PRELOAD 注入生效原因的关键。

## 三、形式化与数学基础

第 $i$ 个外部函数解析状态满足：

$$GOT[2+i]=\begin{cases} PLT_{stub\_addr} & \text{未绑定}\\ addr(f_i) & \text{已绑定} \end{cases}$$

绑定次数 $B\le N$（$N$ 为被实际调用的函数数，而非全部导入数），故启动期只解析「真正用到」的符号，首跳有解析开销、后续零开销。严格说，每次进程首次调用某函数付出一次 `_dl_runtime_resolve` 代价，之后该代价消失。

设解析一次的平均成本为 $t_{resolve}$（含哈希查表与（可能）字符串比较），首次调用总延迟为：

$$T_{first}(f) = t_{resolve}(f) + t_{call},\qquad T_{later}(f)=t_{call}$$

因此惰性绑定把「$N\cdot t_{resolve}$ 的启动成本」压缩为「实际调用函数数 $B \cdot t_{resolve}$ 的分散成本」。

## 四、代码实现

```asm
; x86-64 PLT 跳转（简化）
plt_foo:
    jmp *GOT[2+i]            ; 已绑定则直跳；未绑定则跳到下方
    push $i                  ; 传符号索引
    jmp PLT[0]               ; 进入 _dl_runtime_resolve
; PLT[0]:
;   jmp *GOT[2]             ; 跳动态链接器
; 解析后 GOT[2+i] 被改写为 foo 真实地址
```

注意：GOT 是数据、PLT 是代码，二者角色不同但配合完成延迟绑定。`_dl_runtime_resolve` 根据 `link_map` 与符号索引在 `.rela.plt` 中查表并填写。

```bash
# 观察惰性绑定相关的节与重定位项
readelf -r ./app | grep -A2 'rela.plt'   # 每个 JUMP_SLOT 对应一个 PLT 项
readelf -d ./app | grep -E 'JMPREL|PLTGOT|BIND_NOW'
# 环境变量可直接切换绑定策略
LD_BIND_NOW=1 ./app                       # 强制立即绑定（等同 -z now）
LD_DEBUG=bindings ./app                   # 打印每次符号绑定的过程
```

## 五、与其他技术对比

| 绑定策略 | 启动 | 首次调用 | 安全 | 说明 |
| --- | --- | --- | --- | --- |
| 惰性（lazy） | 快 | 有解析开销 | 弱（GOT 可写） | 默认传统 |
| 立即（-z now） | 慢 | 无 | 强（可 RELRO） | 安全加固 |

惰性绑定省启动时间但首次调用有开销且难做完整 relocation 校验；立即绑定的 GOT 可设为只读（full RELRO），利于 CFI/W^X 防护。

| 加固项 | 效果 | 代价 |
| --- | --- | --- |
| partial RELRO | 重定位后 `.got` 部分只读 | 低 |
| full RELRO (`-z now` + `-z relro`) | GOT 全部只读 | 启动稍慢 |
| BIND_NOW | 消除惰性解析 | 启动稍慢 |
| IFUNC | 按 CPU 特性选实现 | 解析更复杂 |

## 六、常见误区

1. 认为 PLT 与 GOT 是一回事——PLT 是代码桩，GOT 是数据表，前者跳、后者存地址。
2. 以为 GOT 只存函数——它也存全局变量地址（通过 `R_X86_64_GLOB_DAT` 填充）。
3. 在只读 GOT 上加写保护（RELRO）可防 GOT 劫持，但与惰性绑定冲突——故 full RELRO 通常配 `-z now`。
4. 误以为所有函数都惰性绑定——`IFUNC`、被 `-z now` 强制的、以及 `BIND_NOW` 环境变量指定的会立即绑定。
5. 误以为 PLT 只有一条——每个外部函数各有一条 PLT 项，`PLT[0]` 是公共解析入口。
6. 误以为惰性绑定线程不安全——`ld.so` 内部以锁保护解析过程，多线程首调同函数只会解析一次。

## 七、与开源书·权威来源对应

- CSAPP 7.13 完整走查 lazy binding 的 PLT/GOT 流程与 `_dl_runtime_resolve`。
- Levine《Linkers and Loaders》第 10 章讲动态链接器与符号解析。
- glibc `sysdeps/x86_64/dl-trampoline.S` 是 PLT 跳板的真实实现。
- Ulrich Drepper「How To Write Shared Libraries」给出 RELRO、BIND_NOW 与符号可见性的实践指导。

## 八、面试题

1. PLT 与 GOT 各自作用？答：PLT 是调用跳板（代码），GOT 存目标地址（数据）；首次经 PLT 进链接器解析并回填 GOT。
2. lazy binding 流程？答：首跳 GOT 指向 PLT 残桩 → 进 `_dl_runtime_resolve` 解析 → 回填 GOT → 直跳函数。
3. 为何 RELRO 需关闭惰性绑定？答：full RELRO 把 GOT 设只读，而惰性绑定需在运行时写 GOT，故必须先 `-z now` 全部绑定。
4. `GOT[1]`/`GOT[2]` 存什么？答：`GOT[1]` 存 `link_map`，`GOT[2]` 存 `_dl_runtime_resolve` 入口，供首次解析使用。
5. 为何 `LD_PRELOAD` 能覆盖库函数？答：符号解析按 `link_map` 搜索域顺序查找，预加载库排在前列，先被命中。
6. 惰性绑定下如何观察某函数是否已解析？答：用 `LD_DEBUG=bindings` 查看绑定日志，或读取该函数对应的 `JUMP_SLOT` 是否已指向真实地址。

## 九、演进与趋势

IFUNC 解析（按 CPU 特性选最优实现）、GOT 只读化（full RELRO）、`-z now` 默认化成为主流发行版加固基线；`DT_RELACOUNT` 加速立即绑定。`_dl_runtime_resolve` 也逐步加入字符串校验以防滥用（缓解 RELRO 缺失下的 GOT-overflow 攻击）。

另一条主线是「减少解析」：`-Wl,-Bsymbolic` 让库内引用绑定到自身定义、避免被外部符号截获；`DT_GNU_HASH` 以更紧凑的哈希表加速查表；`--as-needed` 消除无用依赖减少 `link_map` 长度。这些都在压低动态链接的固定开销，使 PIE + 全绑定成为既能加固、性能又可接受的默认配置。

## 十、小结

PLT/GOT 把地址解析推迟到首次使用，是空间与时间权衡的经典实现。理解「GOT 未绑定指向 PLT 残桩」是读懂动态链接的关键。同时要意识到这套机制同时承担性能与安全职责：加固的做法（full RELRO + `-z now`）本质上是用一点启动时间换取「运行期无可写函数指针表」，从而关闭 GOT 劫持这一整类攻击面。
