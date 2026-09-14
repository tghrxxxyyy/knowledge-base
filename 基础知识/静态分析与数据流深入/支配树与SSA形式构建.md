# 支配树与SSA形式构建

> 对应 Cytron, Ferrante, Rosen, Wegman & Zadeck 1991《Efficiently Computing Static Single Assignment Form and the Control Dependence Graph》；Lengauer & Tarjan 1979《A Fast Algorithm for Finding Dominators in a Flowgraph》；Appel《Modern Compiler Implementation》SSA 章节。

## 一、背景与挑战
传统数据流分析在基本块粒度上重复表示事实：若 100 个块都使用同一变量，到达定值分析就要在这 100 个块上分别迭代集合，信息冗余且收敛慢。更麻烦的是，「某使用点读到哪一次赋值」在图上只是隐式的，需要靠可达性求解去还原。

SSA（Static Single Assignment，静态单赋值）用一条简单规则消除这种隐式性：每个变量只被赋值一次，每次赋值产生一个新名字。于是「使用读到哪个定值」变成名字匹配问题。代价是控制流汇合处需要引入 φ 函数，表达「来自不同路径的不同版本」。

## 二、核心原理
**支配关系**：$d$ 支配 $n$（$d\ dom\ n$）表示所有从入口到 $n$ 的路径都经过 $d$。每个节点（除入口）有唯一的**直接支配者**（immediate dominator，$idom$），把 $idom$ 边连起来得到**支配树**，其父子关系刻画了「必经路径」的层次结构。

**支配边界** $DF(n)$ 定义为「$n$ 支配某个前驱、但 $n$ 不严格支配该节点自身」的节点集合，直观含义是「$n$ 的影响范围刚好结束的那一层汇合点」。它是 φ 插入位置的唯一依据。

**最小 SSA（minimal SSA）** 的插入算法：
1. 对每个变量 $v$，取所有定义块作为工作集；
2. 取出块 $b$，对每个 $y \in DF(b)$：若 $y$ 还没有 $v$ 的 φ 就插入一个，并把 $y$ 加入工作集（新插入的 φ 本身也是一次定义）；
3. 直到工作集为空。

**重命名**：在支配树上做一次深度优先遍历，为每个变量维护版本栈：遇定义压入新版本、遇使用取栈顶、离开块时弹出本块压入的版本。φ 的每个操作数对应一条前驱边，必须在前驱的版本上下文中填入。

**退出 SSA（de-SSA）**：SSA 不是机器可执行形式，需要把 φ 换成实际拷贝。这里有两个著名陷阱——丢失拷贝（lost copy）与交换问题（swap problem），标准解法是插入并行拷贝并打断回边上的拷贝链。

## 三、形式化与数学基础
支配关系的迭代定义：
$$dom(entry) = \{entry\}, \qquad dom(n) = \{n\} \cup \bigcap_{p \in pred(n)} dom(p)$$
所有节点的 $dom$ 集合只增不减且有上界，故有限步收敛。直接支配者是 $dom(n)\setminus\{n\}$ 中被其余所有支配者支配的那一个。

支配边界的形式化定义：
$$DF(n) = \{\, y \mid \exists z \in succ(n):\ n \ dom\ z\ \text{且}\ (n\ dom\ y\ \text{不成立 或}\ y = n) \,\}$$
工程实现常把它拆成 $DF(n) = DF_{local}(n) \cup DF_{up}(n)$：前者收集「后继块中 $idom$ 不是 $n$ 的节点」，后者自底向上合并子节点的支配边界。这个分解是 Cytron 等人的关键贡献，把支配边界的计算降到「支配树上一遍遍历」。

φ 的语义是**并行赋值**：位于块首的所有 φ 在同一时刻读取各自前驱的值，即
$$\phi(v_{from\,P_1}, \dots, v_{from\,P_k})\ \text{的第 } i \text{ 个操作数对应边 } (P_i, B)$$
这一并行语义正是 de-SSA 必须用临时变量打断循环拷贝链的根本原因。

## 四、代码实现
支配边界的计算与 φ 插入的迭代（基于工作集）。
```python
def compute_df(blocks, idom, preds):
    # 简化写法：对每个汇合点，沿 idom 链上溯到该汇合点的直接支配者
    DF = {b: set() for b in blocks}
    for b in blocks:
        if len(preds[b]) >= 2:                 # 只处理汇合点
            for p in preds[b]:
                runner = p
                while runner is not None and runner != idom[b]:
                    DF[runner].add(b)          # b 属于 runner 的支配边界
                    runner = idom[runner]
    return DF

def insert_phi(df, defs_of, all_vars):
    has_phi = {v: set() for v in all_vars}
    for v in all_vars:
        work = set(defs_of[v])                 # 所有定义块入队
        while work:
            b = work.pop()
            for y in df[b]:
                if y not in has_phi[v]:        # 幂等：每块每变量至多一个 φ
                    has_phi[v].add(y)
                    insert_phi_node(y, v)
                    if y not in defs_of[v]:    # φ 本身是定义，需继续传播
                        work.add(y)
    return has_phi
```
重命名遍历的骨架（完整实现还需要版本栈与 φ 操作数回填）：
```python
def rename(b, children, blocks, stacks):
    for stmt in blocks[b].statements:
        for u in stmt.uses:                        # 使用：取栈顶版本
            stmt.replace(u, stacks[u][-1])
        for d in stmt.defs:                        # 定义：压入新版本
            stmt.rename_def(push(stacks, d))
    for s in blocks[b].succs:                      # 用当前版本填后继 φ 操作数
        for phi in blocks[s].phis:
            phi.set_operand(b, stacks[phi.var][-1])
    for c in children[b]:
        rename(c, children, blocks, stacks)
```
要点：`insert_phi` 的幂等判断必不可少，否则同一块会被反复插 φ 导致不终止；填 φ 操作数时要用**前驱**的版本栈；离开块时还要把本块压入的版本按逆序弹出。

## 五、与其他技术对比
| 支配算法 | 复杂度（量级） | 实现难度 | 适用场景 |
| --- | --- | --- | --- |
| Cooper-Harvey-Kennedy | 实践中接近线性 | 低 | 生产编译器（简单且快） |
| Lengauer-Tarjan | $O(m\,\alpha(m,n))$ | 高 | 超大图、要求理论上界 |

| SSA 形式 | φ 数量 | 需要活跃信息 | 主要收益 |
| --- | --- | --- | --- |
| 最小 SSA | 较少（正确性下限） | 否 | 构建简单、通用 |
| 修剪 SSA | 最少 | 是 | 减少无效 φ，降低后续开销 |

## 六、常见误区
- 认为 φ 是运行时的分支判断。φ 只是汇合点的语法记号，表示「按来自哪条边选版本」，不存在运行时条件语句。
- 漏插支配边界上的 φ。变量定义在多个汇合点共享时，漏掉任何一个都会让某个使用点拿到错误版本。
- 把 φ 当普通赋值。φ 是并行赋值语义，顺序执行会改变含义，de-SSA 时必须用临时变量处理交换问题。
- 认为 SSA 可以直接生成机器码。必须经过 de-SSA（复制合并、插并行拷贝）或与寄存器分配融合。
- 忽略临界边（critical edge）拆分。按边插入代码前必须先拆分「源有多个后继且目标有多个前驱」的边。

## 七、与开源书·权威来源对应
- Cytron, Ferrante, Rosen, Wegman & Zadeck 1991：给出支配边界的形式化定义、最小 SSA 的 φ 插入算法与重命名过程，是本节的核心出处。
- Lengauer & Tarjan 1979：给出经典快速支配算法，为支配树计算提供理论复杂度上界。
- Cooper, Harvey & Kennedy 的支配算法工作：以极简实现达到实践中接近线性的性能，是生产编译器的常用方案。
- Appel《Modern Compiler Implementation》SSA 章节：用可执行风格给出 SSA 构建与销毁的实现路径，并讨论 φ 的并行语义。
- Wegman & Zadeck 的稀疏条件常量传播工作：展示 SSA 上的分析比传统块迭代更高效。

## 八、面试题
1. 支配树的作用是什么？要点：刻画「必经路径」的层次结构，$idom$ 唯一，是支配边界计算、循环识别与重命名遍历的基础。
2. φ 函数在什么位置插入？要点：变量所有定义块的支配边界所覆盖的块；若该块已有 φ 则跳过，并把新插入 φ 的块继续加入工作集。
3. 为什么 φ 必须有并行语义？要点：φ 的所有操作数对应不同前驱边、在同一时刻读取；顺序执行会破坏语义，de-SSA 需用临时变量。
4. de-SSA 的两个经典陷阱是什么？要点：丢失拷贝与交换问题（回边上的拷贝顺序），对策是插并行拷贝并打断循环中的拷贝链。

## 九、演进与趋势
SSA 从「一种中间表示」演进为「编译器优化的基础设施」：稀疏条件常量传播、GVN、基于 SSA 的寄存器分配都建立在其上；e-SSA / Gated SSA 扩展了异常边与条件化定义的处理；内存 SSA 把别名与内存版本结合，使内存优化也能享受 SSA 的稀疏性。现代 IR（如 MLIR）把 SSA 与结构化控制流一并作为一等抽象，并为增量编译与 JIT 提供按需重建支配信息的能力。具体设计与接口以官方最新文档为准。

## 十、小结
支配树与支配边界是 SSA 构建的数学核心：支配边界精确回答了「φ 应该插在哪」，支配树上的重命名遍历则把「哪个版本被使用」编码进变量名。掌握这两步之后，SSA 的收益——稀疏分析、更快的收敛、更清晰的定值-使用关系——都是自然推论，而 de-SSA 的并行拷贝语义则是实现时必须付清的最后一笔账。
