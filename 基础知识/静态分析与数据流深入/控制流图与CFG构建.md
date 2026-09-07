# 控制流图与CFG构建

> 对应 Appel《Modern Compiler Implementation》第 18 章；Aho 等《Compilers》第 8 章。

## 一、背景与挑战
一切静态分析都建立在 CFG 之上：节点是基本块（单入口单出口、无内部分支），边表示可能控制转移。CFG 不准则后续分析全盘皆错。

## 二、核心原理
线性化指令，按领导者（leader）划分基本块：首指令、跳转目标、跳转后指令为 leader。相邻 leader 间为一块。边由块尾跳转/条件/ fall-through 建立，合并可达性识别。异常边、函数调用边可单独标注。

## 三、形式化与数学基础
基本块划分满足：
$$leaders = \{first\} \cup targets(jumps) \cup successors(targets)$$
块间边 $E = \{(B_i,B_j)\mid last(B_i)\text{ 可转到 }first(B_j)\}$。CFG 是有向图 $G=(V,E)$。

## 四、代码实现
```python
def build_cfg(instrs):
    leaders = compute_leaders(instrs)
    blocks = split(leaders)
    for b in blocks:
        for t in successors(last(b)):
            add_edge(b, block_of(t))
    return blocks
```

## 五、与其他技术对比
基于字节码的 CFG 易得（显式跳转）；基于 AST 需经线性化；SSA 的 CFG 需在 φ 处补临界边拆分。

## 六、常见误区
1. 忽略间接跳转（switch 表）导致 CFG 不连通。
2. 函数调用当普通边——应标 call 边并假设杀寄存器。
3. 异常/longjmp 破坏结构化 CFG，需特殊边。

## 七、与开源书/权威来源对应
Appel ch18 完整 CFG 与基本块算法；龙书 ch8；cmu-db/15445 用到 CFG。

## 八、面试题
问：什么是基本块？leader 如何确定？CFG 边有哪几类？

## 九、演进与趋势
MLIR/LLVM 以显式 CFG 作为 IR 核心；控制流完整性（CFI）在 CFG 上做运行时校验。

## 十、小结
CFG 把程序控制结构显式成图，是所有数据流与别名分析赖以成立的地基。
