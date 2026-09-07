# 向量时钟在Dynamo中的应用

> 对应 DeCandia et al. 2007（Dynamo：Vector clocks for conflict detection）与 Kleppmann DDIA 第5章。

## 一、背景与挑战
Dynamo 是无主最终一致存储，同一 key 可能被多个节点并发修改，产生冲突。Dynamo 用向量时钟（文中称 version vector）追踪每个副本的修改因果，识别冲突并交给应用合并。

## 二、核心原理
- 每次写，节点在对象的向量时钟对应自己维度 +1。
- 读时返回对象及其向量时钟；客户端修改后带上原时钟。
- 若新时钟能 dominates 旧时钟，则无冲突直接覆盖；否则为并发冲突，保留多个版本（sibling）供合并。

## 三、形式化与数学基础
对象版本集合 $\{ (v_i, data_i) \}$。写返回时钟 $V_{new} = V_{old}[coordinator] + 1$。读取时若两版本 $V_a, V_b$ 互不 dominate，则合并需应用层 $merge(data_a, data_b)$。

## 四、代码实现
# 判断支配关系
def dominates(a, b):
    return all(a[j] >= b[j] for j in range(len(a))) and any(a[j] > b[j] for j in range(len(a)))

## 五、与其他技术对比
- 对比 last-write-wins：LWW 丢失并发更新，向量时钟保留它们。
- 对比 CRDT：Dynamo 把合并交给应用，CRDT 自动合并。

## 六、常见误区
1. 向量时钟过大拖慢存储——需定期剪枝。
2. 误以为 Dynamo 自动解决冲突——需应用层 merge。

## 七、与开源书/权威来源对应
- DeCandia et al. 2007, §4.3 Vector Clocks。
- Kleppmann, DDIA, Ch.5。
- Vonng/ddia。

## 八、面试题
1. Dynamo 如何用向量时钟检测冲突？
2. 冲突后为什么需要应用层合并？

## 九、演进与趋势
用 CRDT 替代手工 merge，减少应用负担。

## 十、小结
向量时钟让无主存储能精确识别并发写，把冲突暴露而非掩盖。
