# 栈式机器到寄存器机器Lowering

> 对应 Aho, Sethi & Ullman《Compilers》第 6、8 章；Appel《Modern Compiler Implementation》第 8 章；Lindholm & Yellin《JVM Specification》。

## 一、背景与挑战

JVM 字节码、WebAssembly 等栈式 IR 用操作数栈隐式表达计算，而物理 CPU 是寄存器架构。把「push/pop 操作数栈」的语义 lowering 为「显式寄存器分配与数据移动」，是跨架构代码生成的关键转换。难点在于：栈式 IR 隐藏了值的位置，lowering 必须恢复显式数据流、尽量少的引入冗余 move，并且正确处理类型——否则后续寄存器分配会爆炸或生成错误宽度的指令。

另一个常被低估的难点是「栈的隐式控制流交汇」：栈式 IR 中，跳转目标处的栈深度与类型必须一致（验证器强制保证），但不同来源路径可能把不同的值留在同一栈槽位置。Lowering 时若不做 φ 合并（SSA 化），就会把「同一栈槽在不同路径下的不同来源」错误地当成同一个值，从而生成语义错误的代码。

## 二、核心原理

栈式求值（如 `a = b + c` 对应 `push b; push c; add`）中，每个 push 把值压栈，每个二元操作弹出两个操作数、压回结果。Lowering 把栈槽映射为虚拟寄存器：连续 pop/push 转为寄存器间 move 或直接作为指令操作数，再经寄存器分配与调度生成机器码。关键是指出每个栈槽的生命周期，把同生命周期的槽合并到同一虚拟寄存器，减少寄存器压力。现代 JIT 不在字节码层做这步，而是先把字节码提升为图（C2 的 ideal graph / Graal 的 HIR），再做 SSA 化与优化。

「栈槽即隐式虚拟寄存器」是理解 lowering 的关键视角：栈深度 $d$ 处的槽，等价于一个在某时间区间内活跃的变量。因此 lowering 的实质工作是「把隐式的活跃区间显式化」，一旦活跃区间确定，后续就可以直接套用标准的寄存器分配算法（图着色或线性扫描）。这也解释了为什么先把栈式 IR 提升为 SSA 形式更高效：SSA 天然表达了活跃区间的边界，使合并变得平凡。

## 三、形式化与数学基础

栈操作转为三地址形式：

$$push\ x \to t_i = x;\qquad add \to t_k = t_i + t_j$$

栈深度约束保证类型正确：任意执行点 $\sum arity = depth$。由于任一时刻栈上值数不超最大栈深，所需虚拟寄存器数满足：

$$|vregs| \le \max_{state} stack\_depth$$

这给出寄存器需求的上界，是分配器预算的依据。若进一步做 SSA，则同一深度的不同槽可合并，实际虚拟寄存器数常远小于该上界。

可以更精确地刻画「实际需要多少寄存器」：设基本块内栈深的最大值为 $D_{bb}$，若各槽活跃区间互不重叠则可全部复用同一寄存器，故实际需求为「任意时刻同时活跃的槽数最大值」，即活跃区间图的色数。对于直线代码，这个值通常为 2–3（因为二元操作的求值过程天然只需少量临时量），远小于 $D_{bb}$。这正是「栈深只是上界」的量化含义——把 $D_{bb}$ 当作寄存器需求会造成严重的过度 spill。

## 四、代码实现

```python
# 栈式字节码到三地址（伪代码）
def lower(instrs):
    stack = []
    for i in instrs:
        if i.op == 'push':
            stack.append(i.val)              # 压入常量或局部
        elif i.op == 'add':
            b, a = stack.pop(), stack.pop()
            t = new_tmp()                     # 新虚拟寄存器
            emit(f"{t} = {a} + {b}")
            stack.append(t)
        elif i.op == 'load':
            t = new_tmp()
            emit(f"{t} = mem[{i.addr}]")
            stack.append(t)
        elif i.op == 'store':
            v = stack.pop()
            emit(f"mem[{i.addr}] = {v}")
        elif i.op == 'jmp_if':
            # 栈式 IR 的控制流交汇点：需为各栈槽插入 φ
            target = i.target
            record_stack_shape(target, [type_of(s) for s in stack])
    return ssa_build()                        # 构造 SSA：同槽不同来源合并为 φ

# 合并同生命周期：相邻 push/pop 指向同一物理寄存器，避免 move
```

`record_stack_shape` 与随后的 `ssa_build` 共同解决「交汇点」问题：在 `jmp_if` 这类控制流分叉处，必须记录当前栈的形状（深度与类型），待所有前驱汇合时插入 φ 节点，把「来自不同路径的同一栈槽」显式表示为「多来源值」。若省略这一步，后续优化会把两个来源当作同一变量，导致错误的值传播。

## 五、与其他技术对比

| 维度 | 栈式 IR | 寄存器 IR | 图 IR（SSA） |
| --- | --- | --- | --- |
| 紧凑性 | 高（无操作数编码） | 低 | 低 |
| 架构无关 | 强 | 弱 | 中 |
| 优化友好 | 需 lowering 后 | 直接 | 最友好 |
| 验证难度 | 低（栈深/类型即可） | 中 | 高 |
| 典型代表 | JVM 字节码、Wasm | 早期汇编 IR | LLVM IR、Graal HIR |

栈式 IR 紧凑、与架构无关、易验证；寄存器 IR 更贴近执行、利于优化。现代 JVM 经 JIT 把字节码直接 lowering 到寄存器机器再做优化，WebAssembly 也类似地先译到寄存器后端。

## 六、常见误区

1. 一对一翻译 push/pop 致大量冗余 move：应合并同生命周期栈槽。
2. 忽略栈槽类型致 lowering 丢失信息：需保留类型以选对指令宽度（int vs long vs float）。
3. 未合并同生命周期栈槽浪费寄存器：正确的 SSA 构建可消除大部分临时量。
4. 把栈深度当寄存器数：深度只是上界，实际经合并后远小于此，滥用会过度 spill。
5. 在 lowering 阶段做激进优化：过早优化可能破坏异常/内存语义，应先保正确再优化。
6. 忽略控制流交汇处的栈形状一致性：不做 φ 合并会把不同来源误当同值，生成错误代码。
7. 把栈式 IR 的「验证通过」等同于「语义正确」：验证器只检查深度与类型，不保证 lowering 实现无误。
8. 认为 lowering 与后续优化可以完全分离：活跃区间信息在 lowering 时才能精确获得，过早丢弃会削弱优化效果。

## 七、与开源书·权威来源对应

- Aho 等《Compilers》第 6 章讲栈式中间表示与翻译，第 8 章讲 lowering 到目标代码。
- Appel《Modern Compiler Implementation》第 8 章讲从栈式/树式到三地址的 lowering 与临时量管理。
- Lindholm & Yellin《JVM Specification》定义操作数栈语义。
- Muchnick《Advanced Compiler Design and Implementation》讨论 SSA 构造与寄存器分配的实现。

## 八、面试题

1. 问：栈式如何转换为寄存器式？最大寄存器数？
   答：按求值顺序把 push/pop 映射为三地址赋值，最大虚拟寄存器数 ≤ 最大栈深（实际经 SSA 合并更少）。
2. 问：为何 JVM 用栈式 IR？
   答：与架构无关、字节码紧凑、易验证与跨平台；真正性能由 JIT lowering 到寄存器后端保证。
3. 问：如何减少 lowering 后的冗余 move？
   答：做 SSA 构建与合并同生命周期临时量，配合寄存器分配消除 move，必要时用 coalescing。
4. 问：WebAssembly 也是栈式，为何能高效运行？
   答：Wasm 栈式只是线性编码，引擎（V8/Spidermonkey）会先提升到 SSA/图 IR 再做寄存器分配，与 JVM 思路一致。
5. 问：为什么栈深度不是寄存器需求？
   答：相同栈槽的活跃区间通常互不重叠，可复用同一寄存器；真实需求是「同时活跃槽数的最大值」。
6. 问：控制流交汇在 lowering 时要注意什么？
   答：各前驱路径的栈形状（深度与类型）必须一致，并为多来源槽插入 φ，否则值会错误合并。

## 九、演进与趋势

GraalVM 把字节码直接图化做高级优化（partial escape、inlining）；WebAssembly 虽栈式但易译到寄存器；MLIR 提供 stack 与 register dialects 间的显式转换 pass，把 lowering 变成可组合的中端阶段。

另一条趋势是「分层 lowering」：在栈式 IR 与机器码之间引入多个递减抽象层次的方言，每一层只做局部而明确的转换，从而使每一步都可单独测试与验证。这种做法显著降低了跨架构后端的维护成本，也让「新增一种目标架构」变成组合已有 pass 而非从零实现。

## 十、小结

Lowering 把隐式栈语义显式化为寄存器操作，是跨架构代码生成的关键转换。其要点不在「能翻译」，而在「翻译得省寄存器、少 move」——把栈深度上界转化为可分配的 SSA 形式，后端优化才有施展空间。栈式 IR 的优雅在于「与机器无关」，而它的代价也正在此：总有一道 lowering 的桥要修。

三条要点：栈槽即隐式虚拟寄存器（活跃区间是核心）、交汇点必须插 φ（否则值错误合并）、栈深只是上界（别拿它当寄存器需求）。
