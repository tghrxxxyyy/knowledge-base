# 支配树与SSA形式构建

> 对应 Appel《Modern Compiler Implementation》第 19 章；Aho 等《Compilers》第 9 章。

## 一、背景与挑战
传统数据流在每块重复 facts，低效且冗余。SSA（静态单赋值）给每个变量每次定义新名，使定值-使用关系显式化为 φ 函数，极大简化分析。

## 二、核心原理
先求支配树：节点 d 支配 n 当且仅当所有到 n 的路径都经 d。支配边界（DF）是"受 φ 影响"的汇合点。对每个变量，在其定义块 d 的 DF 插入 φ，递归传播，最后重命名变量版本。

## 三、形式化与数学基础
支配关系 $dom$ 由迭代：
$$dom(n) = \{n\} \cup \left(\bigcap_{p\in pred(n)} dom(p)\right)$$
支配边界 $DF(B)=\{Y\mid \exists Z\in succ(B),\ B\ dom^+\ Z,\ Y\not dom\ Z\}$。

## 四、代码实现
```python
# 插入 phi 的迭代（简化）
work = defs(var)
while work:
    b = work.pop()
    for y in DF[b]:
        if no_phi(var, y):
            insert_phi(var, y)
            if y not in defs(var): work.add(y)
```

## 五、与其他技术对比
SSA 增加 φ 节点但把流不敏感转为流敏感显式边，分析更快更准；非 SSA 需反复迭代 CFG 才收敛。

## 六、常见误区
1. 认为 φ 是运行时分支——它只是汇合点的语法记号。
2. 漏插 DF 上的 φ 导致丢失定值。
3. SSA 破坏后（销毁）才能生成机器码，需 de-SSA（复制合并）。

## 七、与开源书/权威来源对应
Appel ch19 完整算法（Cytron et al.）；龙书 ch9 讲支配；cmu-db/15445 用 SSA。

## 八、面试题
问：支配树作用？φ 函数何时插入？SSA 为何利于优化？

## 九、演进与趋势
Gated SSA、e-SSA 处理异常边；MLIR 把 SSA 作为一等 IR 抽象。

## 十、小结
支配树与支配边界是 SSA 构建的数学核心，把隐式控制依赖转为显式 φ 节点。
