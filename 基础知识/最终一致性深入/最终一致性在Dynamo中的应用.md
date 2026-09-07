# 最终一致性在Dynamo中的应用

> 对应 DeCandia et al. 2007（Amazon Dynamo 全文）与 Vogels 2009（Eventually Consistent）。

## 一、背景与挑战
Dynamo 为购物车等场景设计，优先可用性（永不拒绝写），接受最终一致。它通过向量时钟、反熵、读修复与 hinted handoff 实现可配置的最终一致。

## 二、核心原理
- 无主架构：任何健康节点都可协调写。
- 用 N/R/W 调一致级别，默认偏向高可用。
- 冲突用向量时钟识别，sibling 交给应用合并。
- 反熵+读修复保证最终收敛。

## 三、形式化与数学基础
在 N=3、W=R=2 下为强一致读；在 W=R=1 下为宽松最终一致。无论哪种，停止写入后通过反熵在 $O(\log n)$ 轮内收敛。

## 四、代码实现
# Dynamo 风格写协调
def coord_write(key, val, ring, healthy, N, W):
    targets = preference_list(ring, key, N)
    ok = sum(1 for t in targets if t in healthy and put(t, key, val))
    return ok >= W

## 五、与其他技术对比
- 对比 Bigtable：Bigtable 偏 CP，Dynamo 偏 AP。
- 对比 ZooKeeper：ZK 是线性一致协调服务。

## 六、常见误区
1. 以为 Dynamo 永远不丢写——W 太小时仍可能。
2. 忽略冲突合并的业务复杂度。

## 七、与开源书/权威来源对应
- DeCandia et al. 2007。
- Vogels 2009。
- Kleppmann, DDIA, Ch.5。

## 八、面试题
1. Dynamo 如何保证最终一致？
2. 为什么购物车适合最终一致？

## 九、演进与趋势
DynamoDB 在托管层提供可调强一致读选项。

## 十、小结
Dynamo 是最终一致工程的典范，用多机制协同实现“高可用且收敛”。
