# 共享库版本符号与SONAME

> 对应 Levine《Linkers and Loaders》第 12 章；glibc `ld.so` 手册与 ELF 规范。

## 一、背景与挑战

系统升级 libc 等共享库后，旧程序若直接复用新库，可能因符号语义变化（ABI 不兼容）而崩溃。需要一套「在不破坏旧程序的前提下演进库」的机制：既要让新程序用新库，又要让老程序继续用老符号。版本符号（version symbol）与 SONAME 正是为此而生。ABI 兼容是难题：函数签名不变时，内部行为（如错误码范围、副作用）变化仍可能破坏旧程序，版本符号只能在「符号存在性」层面保证，无法保证语义。

因此实践中要区分三个层次：源码兼容（重新编译即可）、ABI 兼容（已编译二进制可直接运行）、语义兼容（行为不变）。版本符号保障的是第二层；第三层只能靠开发者纪律与测试。混淆三者是「明明符号没变却出问题」类故障的常见根因。

## 二、核心原理

每个共享库声明 SONAME（如 `libc.so.6`），可执行文件记录它依赖的 SONAME 而非具体文件名。运行时 `ld.so` 按 SONAME 找库。版本符号给符号打版本标签（version node），链接器记录程序所需的最低版本，运行时只解析存在的版本节点。这样同一 `.so` 文件可同时包含多代符号定义，老程序绑定老版本、新程序绑定新版本，实现「单文件服务多 ABI 代际」。版本脚本（version script）以 `GLIBC_2.2.5` 等节点名组织符号，旧节点保留、新符号加新节点。

运行时匹配过程可概括为三步：`ld.so` 读程序 `.gnu.version_r` 中记录的「所需版本节点名与哈希」，在库的 `.gnu.version_d` 中查找同名节点，命中则把该节点下的符号地址填入 GOT；未命中即报 `symbol version not found`。因此版本节点名一旦发布即成为 ABI 的一部分，绝不可改名或删除。

## 三、形式化与数学基础

依赖图满足兼容性偏序：$v_a\preceq v_b$ 表示 $a$ 版符号集被 $b$ 包含。加载时要求：

$$\forall s\in needs(app),\ \exists v\ge minver(s)\ \text{in library}$$

否则报 `symbol version not found`。ABI 兼容即「新增符号、保留旧符号语义」，破坏则 bump SONAME（如 `libc.so.6` → 若破坏性变更则新 SONAME）。版本节点形成树：子节点继承父节点符号并追加新符号。

| 变更类型 | ABI 影响 | 应对 |
| --- | --- | --- |
| 新增函数 | 兼容 | 新版本节点，SONAME 不变 |
| 新增结构字段（末尾） | 通常兼容 | 谨慎验证布局 |
| 改变函数签名 | 破坏 | 新版本节点 + 保留旧符号 |
| 改变结构布局/枚举值 | 破坏 | bump SONAME |

## 四、代码实现

```bash
# 查看 SONAME 与版本需求
readelf -d libdemo.so | grep SONAME        # 输出 SONAME
objdump -p app | grep NEEDED               # 程序依赖的 SONAME 列表
readelf -V libc.so.6                       # 版本符号节点（VERDEF/VERNEED）
# 链接时指定版本脚本
ld -shared --version-script=lib.ver -o libdemo.so.1 obj.o
```

版本脚本示例（`lib.ver`）：

```
GLIBC_2.2.5 { global: foo; bar; local: *; };
GLIBC_2.34 { global: baz; } GLIBC_2.2.5;   # 新节点继承旧节点
```

```bash
# 构建带 SONAME 的库并建立开发/运行期软链
cc -shared -Wl,-soname,libdemo.so.1 -o libdemo.so.1.0.0 obj.o
ln -sf libdemo.so.1.0.0 libdemo.so.1     # 运行期：程序记录的是 libdemo.so.1
ln -sf libdemo.so.1     libdemo.so       # 链接期：-ldemo 使用
ldconfig -n .                            # 刷新缓存，使 ld.so 能找到 SONAME
```

## 五、与其他技术对比

| 机制 | 兼容性 | 多版本共存 | 说明 |
| --- | --- | --- | --- |
| SONAME+版本符号 | 向后兼容 | 单文件多代 | glibc 方式 |
| 文件名版本（libfoo-1.2.so） | 靠包管理隔离 | 需多文件 | 简单但笨重 |
| 纯 SONAME（musl） | 向后兼容 | 需多文件 | 体积小、无节点 |

SONAME+版本符号把兼容责任从「文件名」移进「ELF 元数据」，实现库平滑演进。musl 则省略版本节点，靠包管理器与符号本身保障，取舍不同。

| 环境变量/配置 | 作用 |
| --- | --- |
| `LD_LIBRARY_PATH` | 额外搜索路径（安全性差，慎用） |
| `RPATH` / `RUNPATH` | 二进制内置搜索路径（RUNPATH 更可控） |
| `/etc/ld.so.cache` | `ldconfig` 生成的 SONAME→路径缓存 |
| `LD_PRELOAD` | 优先加载指定库，实现符号劫持 |

## 六、常见误区

1. 以为改名即可升级——必须保留旧 SONAME 的软链（如 `libc.so.6`）供老程序用，否则老程序启动报 `cannot open shared object`。
2. 误删 `.so.6` 软链会令所有依赖程序无法启动。
3. 版本符号只约束「符号存在性」，不保证「语义兼容」——ABI 行为变化仍需开发者自觉。
4. 误以为 `local: *` 无关紧要——它控制符号导出面，不当导出会拖慢动态解析并增大攻击面。
5. 误把 `RPATH` 与 `RUNPATH` 等同——`RUNPATH` 在依赖库的内部依赖中被忽略，行为更可预测，故现代推荐后者。
6. 误以为 `LD_LIBRARY_PATH` 只影响当前进程——它会传递给子进程，在容器/服务场景可能引入非预期库版本。

## 七、与开源书·权威来源对应

- Levine《Linkers and Loaders》第 12 章详述版本脚本（version script）与 SONAME 机制。
- glibc 源码与 `ld.so` 手册是 SONAME 解析、版本节点匹配的权威参考。
- ELF 规范定义 `.gnu.version`/`.gnu.version_r` 节格式。
- Drepper「How To Write Shared Libraries」给出符号版本化的工程实践与常见陷阱。

## 八、面试题

1. SONAME 作用？答：记录程序依赖的「逻辑库名」，运行时由 ld.so 据此查找具体文件，与文件名解耦，支持软链升级。
2. `ldconfig` 做什么？答：重建 `/etc/ld.so.cache`，把 SONAME → 实际 .so 路径的映射缓存，加速查找。
3. 为什么升级库通常不破坏旧程序？答：SONAME 不变则旧程序仍绑老 SONAME 软链；若 ABI 破坏性变更则 bump SONAME 并保留旧文件。
4. 版本脚本中 `local: *` 作用？答：把未列出的符号设为库私有，缩小动态符号表、加速解析并隐藏实现。
5. `.gnu.version_r` 记录什么？答：程序所依赖的版本节点名与其哈希，供加载期校验库是否提供对应节点。
6. `RPATH` 与 `RUNPATH` 差别？答：两者都是内置搜索路径，但 `RUNPATH` 不作用于依赖库自身的依赖查找，语义更可控。

## 九、演进与趋势

符号版本化与 ELF 符号过滤（symbol filtering）让单文件同时服务多 ABI 代际；`DT_GNU_HASH` 加速符号查找；`--enable-new-dtags` 改用 `RUNPATH`（更可控的搜索路径）替代 `RPATH`。musl libc 则选择「不版本化、纯 SONAME」的更简模型，换取更小体积。

包管理与容器生态也在重构这条链路：容器镜像把依赖库与应用一起打包，弱化了宿主机 SONAME 演进的压力；Nix/Guix 用哈希化路径实现「多版本天然共存、无需软链」；符号版本化本身则趋于稳定，主要用于 libc、libstdc++ 等长期演进的系统库，且新增节点多、删除节点极少。

## 十、小结

SONAME 与版本符号把兼容性责任从文件名转移进 ELF 元数据，实现库的平滑演进与多代共存，是 Linux 共享库生态稳定的基石。掌握它应能回答三类实务问题：为什么升级 libc 不会让旧程序崩（SONAME 未变 + 旧节点保留）；为什么删软链会「全系统起不来」（SONAME 查找链断裂）；以及为什么版本化不能保证语义兼容（它只管符号存在性）。
