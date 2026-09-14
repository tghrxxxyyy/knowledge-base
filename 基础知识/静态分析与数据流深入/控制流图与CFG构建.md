# 控制流图与CFG构建

> 对应 Allen 1970《Control Flow Analysis》；Aho, Lam, Sethi & Ullman《Compilers》中间代码与机器无关优化章节；Appel《Modern Compiler Implementation》数据流分析章节；Tarjan 1974《Testing Flow Graph Reducibility》。

## 一、背景与挑战
几乎所有静态分析都建立在同一张图上：控制流图（control flow graph，CFG）。节点是基本块，边表示可能的控制转移。数据流分析在它上面求不动点，别名分析在它上面传播指向，SSA 在它上面插 φ 节点，控制流完整性（CFI）在它上面做运行时校验。

这决定了 CFG 的质量是地基级别的问题：漏掉一条间接跳转的边，CFG 就会分裂成不连通的碎片；把函数调用当成普通边，寄存器活跃信息就会错；忽略异常边，分析结论在异常路径上就是错的。这些错误不会在分析内部暴露，只表现为「优化结果偶尔不正确」。

## 二、核心原理
**基本块**是「单入口、单出口、内部无分支」的最大指令序列，划分基于领导者（leader）：
- 第一条指令是领导者；
- 任何跳转指令的目标是领导者；
- 任何跳转指令的下一条指令（fall-through）是领导者。

相邻领导者之间构成一个基本块：从某个领导者开始，直到下一个领导者之前的一条指令为止。

**边的建立**取决于块尾指令的语义：无条件跳转到目标块；条件跳转同时连目标块与 fall-through 块；间接跳转（switch 表、虚函数表、函数指针）连所有可能目标；返回通常不建过程内边，改为在调用点建模；异常与 longjmp 连到对应 landing pad。

**虚拟节点**：入口（entry）与出口（exit）作为统一边界，便于数据流分析的初始化；不可达块应被标记并排除，避免污染可达部分的分析结果。

**可约性（reducibility）**：CFG 可约当且仅当可用区间收缩把所有节点折叠成单点；等价地，每条回边（指向能支配它的节点的边）的目标唯一。不可约 CFG 无法被结构化循环识别直接处理，需要先做节点分裂（node splitting）。

## 三、形式化与数学基础
领导者集合的定义：
$$Leaders = \{i_0\} \cup \{\,target(j) \mid j \in Jumps\,\} \cup \{\,next(j) \mid j \in Jumps\,\}$$
基本块由相邻领导者之间的指令区间构成。CFG 是有向图 $G = (V, E)$：
$$V = \{B_1, \dots, B_n\}, \qquad E = \{\,(B_i, B_j) \mid last(B_i) \text{ 可在某状态下转移到 } first(B_j)\,\}$$
支配关系与回边（为可约性判据做准备）。$d$ 支配 $n$（$d\ dom\ n$）当且仅当所有从 entry 到 $n$ 的路径都经过 $d$：
$$dom(entry) = \{entry\}, \qquad dom(n) = \{n\} \cup \bigcap_{p \in pred(n)} dom(p)$$
边 $(u, v)$ 是回边当且仅当 $v\ dom\ u$。可达性由不动点迭代刻画，$Reach_{k+1} = Reach_k \cup succ(Reach_k)$、$Reach_0 = \{entry\}$；不可达块里的定值若被当作可能事实，会直接破坏 must 分析的结论。

## 四、代码实现
从线性指令序列构建 CFG，覆盖条件跳转、无条件跳转与间接跳转。
```python
from collections import deque

def compute_leaders(instrs):
    leaders = {0}
    for ins in instrs:
        if ins.op in ("jmp", "jz", "jnz", "ijmp"):
            if ins.target is not None:
                leaders.add(ins.target.index)
            if ins.idx + 1 < len(instrs):
                leaders.add(ins.idx + 1)              # fall-through 也是领导者
            for t in ins.targets:                     # 间接跳转的全部可能目标
                leaders.add(t.index)
    return sorted(leaders)

def build_cfg(instrs):
    leaders = compute_leaders(instrs)
    idx_to_block, blocks = {}, []
    for i, start in enumerate(leaders):
        end = leaders[i + 1] if i + 1 < len(leaders) else len(instrs)
        blocks.append({"id": i, "start": start, "end": end,
                       "succ": set(), "pred": set()})
        for k in range(start, end):
            idx_to_block[k] = i
    for b in blocks:
        last = instrs[b["end"] - 1]
        if last.op == "jmp":
            b["succ"].add(idx_to_block[last.target.index])
        elif last.op in ("jz", "jnz"):
            b["succ"].add(idx_to_block[last.target.index])
            if b["end"] < len(instrs):
                b["succ"].add(idx_to_block[b["end"]])  # fall-through 边
        elif last.op == "ijmp":
            b["succ"].update(idx_to_block[t.index] for t in last.targets)
        elif last.op not in ("ret", "trap") and b["end"] < len(instrs):
            b["succ"].add(idx_to_block[b["end"]])
    for b in blocks:
        for s in b["succ"]:
            blocks[s]["pred"].add(b["id"])
    return blocks
```
两个要点：`compute_leaders` 必须同时处理「跳转目标」与「跳转的下一条」，否则 fall-through 会被错误并入前一块；构建完成后应立刻用一次 BFS 求出可达集合，把不可达块单独存放而不参与后续汇合。

## 五、与其他技术对比
| CFG 来源 | 间接跳转处理 | 异常边 | 精度 | 典型困难 |
| --- | --- | --- | --- | --- |
| 源级 AST | 无（结构化控制流） | 需按语言语义补 | 高 | 短路求值、finally、析构顺序 |
| 字节码（显式跳转） | switch 表 | 异常表显式给出 | 高 | 栈映射、try 范围边界 |
| 编译器 IR（如 LLVM IR） | `indirectbr` / `invoke` | landing pad | 高 | φ 节点、异常与调用边界 |
| 机器码（二进制） | 需启发式或别名分析 | 通常缺失 | 中～低 | 代码数据混排、跳转表识别 |

| 边类型 | 触发条件 | 分析上的处理 |
| --- | --- | --- |
| 无条件跳转边 | 块尾无条件跳转 | 直接连边 |
| 条件边 + fall-through | 条件跳转 | 两条边 |
| call 边 | 函数调用 | 跨过程分析需建模参数、返回值与被破坏寄存器 |
| 异常边 | 抛出/捕获、landing pad | 与普通边区分，对 must 分析尤其重要 |

## 六、常见误区
- 忽略间接跳转。switch 表、函数指针、虚调用若被漏掉，CFG 会不连通，后续分析在「不可达」的块上永远得不到信息。
- 把函数调用当作普通控制流边。调用会破坏调用者保存寄存器、可能修改全局内存，必须单独建模。
- 忽略异常与 longjmp。异常路径上的状态与正常路径不同，不区分会给出不安全结论。
- 认为 CFG 一定可约。手写汇编、部分优化后的二进制可能产生不可约 CFG，需要节点分裂。
- 保留不可达块不清理。其内部定值会通过汇合污染可达部分，制造虚假的 must 事实。

## 七、与开源书·权威来源对应
- Allen 1970：最早系统提出控制流分析、区间与基本块概念的论文，是 CFG 与结构化循环识别的源头。
- Aho/Lam/Sethi/Ullman《Compilers》：中间代码与机器无关优化章节给出基本块划分的领导者算法与 CFG 构造流程。
- Appel《Modern Compiler Implementation》数据流分析章节：以可执行方式给出基本块、CFG 与后继/前驱关系的构建。
- Tarjan 1974 及 Hecht & Ullman 的工作：给出可约性判定方法与复杂性结果，是理解不可约 CFG 处理的基础。
- LLVM 与 MLIR 官方文档：现代 IR 中基本块、终止指令、异常边与 φ 节点的实际表示（以官方最新文档为准）。

## 八、面试题
1. 什么是基本块？领导者如何确定？要点：单入口单出口且内部无分支的最大指令序列；领导者为首指令、跳转目标、跳转的下一条指令。
2. CFG 的边有哪些类型？要点：无条件与条件跳转边（含 fall-through）、call 边、异常边、间接边，以及 entry/exit 虚拟边。
3. 为什么间接跳转是 CFG 构建的难点？要点：目标集合依赖运行时数据，需要类型或别名分析推断，漏掉会导致图不连通。
4. 可约性意味着什么？要点：可用区间收缩折叠为单点、回边目标唯一；不可约 CFG 需节点分裂才能做结构化循环分析。
5. 不可达块为什么必须清理？要点：其内部信息会在汇合点被当作可能事实，污染可达部分的结论，尤其影响 must 分析。

## 九、演进与趋势
IR 层的演进是「把控制流显式化并结构化」：LLVM 用终结指令显式表达控制转移，MLIR 用 region/block 层次化表达结构化控制流，使 CFG 既是分析对象也是变换对象。二进制侧的趋势是用机器学习与符号执行辅助恢复间接跳转目标，提高 CFG 覆盖率。安全侧，控制流完整性把合法 CFG 作为运行时校验依据，eBPF 类验证器则在加载期校验 CFG 的可达性与不可达指令。具体实现以官方最新文档为准。

## 十、小结
CFG 把程序的控制结构显式成图，是所有静态分析共同的地基。它的构建看似机械，实则处处是正确性边界：领导者与 fall-through 的划分、间接跳转的目标推断、调用与异常边的建模、不可达块的清理，任何一处疏忽都会在不相关的分析里以「偶尔优化错」的形式暴露。
