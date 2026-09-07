# CRDTs与无冲突复制

> 对应 Shapiro et al. 2011（A Comprehensive Study of Convergent and Commutative Replicated Data Types, CRDTs）与 Kleppmann DDIA 第5章。

## 一、背景与挑战
最终一致系统在并发写时产生冲突，需要应用层合并，容易出错。CRDT（无冲突复制数据类型）通过数学结构保证：任意副本并发合并结果确定且一致，无需协调。

## 二、核心原理
- CvRDT（状态）：副本交换状态，用单调合并函数 $merge(a,b)$ 满足交换律、结合律、幂等。
- CmRDT（操作）：交换操作，操作可交换。
- 只要副本收到全部更新（最终），合并结果必然相同。

## 三、形式化与数学基础
合并函数需满足：
$a \sqcup b = b \sqcup a$（交换）
$(a \sqcup b) \sqcup c = a \sqcup (b \sqcup c)$（结合）
$a \sqcup a = a$（幂等）
由此并发更新顺序无关，保证收敛。

## 四、代码实现
# G-Counter（增长计数器）合并
def merge_gcounter(a, b):
    return [max(x, y) for x, y in zip(a, b)]

def increment(c, i):
    c[i] += 1

def value(c):
    return sum(c)

## 五、与其他技术对比
- 对比向量时钟+应用合并：CRDT 自动、无冲突。
- 对比 LWW：LWW 可能丢更新，CRDT 不丢。

## 六、常见误区
1. 以为所有数据类型都能直接 CRDT 化——需合适结构。
2. 忽略 CRDT 元数据增长（如 PN-Counter 需每节点计数器）。

## 七、与开源书/权威来源对应
- Shapiro et al. 2011, CRDTs。
- Kleppmann, DDIA, Ch.5。
- DeCandia et al. 2007（冲突背景）。

## 八、面试题
1. CRDT 为什么能无冲突合并？
2. CvRDT 与 CmRDT 区别？

## 九、演进与趋势
CRDT 用于本地优先（local-first）软件与协同编辑（如 Automerge、Yjs）。

## 十、小结
CRDT 把“最终一致”升级为“无冲突最终一致”，是弱一致系统的优雅解。
