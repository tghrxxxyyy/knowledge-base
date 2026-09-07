# Gossip推模式与拉模式

> 对应 Kleppmann《Designing Data-Intensive Applications》第8章与 DeCandia et al. 2007（Dynamo 论文，描述 push/pull anti-entropy）。

## 一、背景与挑战
Gossip 根据信息交换方向分为三种模式：推（push）、拉（pull）与推拉混合。不同模式在带宽、延迟和一致性收敛速度上各有取舍，直接影响系统的可用性与资源消耗。

## 二、核心原理
- 推模式：持有新状态的节点主动把更新发给邻居。收敛快但接收方可能收到不需要的数据。
- 拉模式：节点周期性向邻居请求缺失状态。带宽更省但对“谁有新数据”无先验。
- 推拉混合：每轮既推也拉，兼顾收敛速度与带宽。

## 三、形式化与数学基础
设单轮传播概率 p，未感染比例 u，则推模式下：
$u_{t+1} = u_t(1-p)^{n-1}$
拉模式需双方都参与采样。混合模式将单轮收敛概率提升到接近 $1 - (1-p)^2$。

## 四、代码实现
# 推拉混合的合并函数示意
def push_pull(local, remote):
    # 推：把 local 比 remote 新的发给 remote
    for k, v in local.items():
        if remote.get(k, 0) < v:
            remote[k] = v
    # 拉：把 remote 比 local 新的合并回 local
    for k, v in remote.items():
        if local.get(k, 0) < v:
            local[k] = v

## 五、与其他技术对比
- 纯推适合写多读少且更新稀疏的场景。
- 纯拉适合带宽受限、读多写少场景。
- 混合模式是 Dynamo/Cassandra 的默认选择。

## 六、常见误区
1. 认为拉模式一定省带宽——大规模下请求元数据也消耗不小。
2. 忽略推模式下“热节点”成为瓶颈。

## 七、与开源书/权威来源对应
- DeCandia et al. 2007, Dynamo: “Merkle trees for anti-entropy”。
- DDIA Ch.8 对副本同步的讨论。
- Cassandra 文档中的 read-repair 与 hinted handoff。

## 八、面试题
1. 推拉混合相比纯推减少多少冗余？
2. 如何用 Merkle 树优化反熵比对？

## 九、演进与趋势
用 Merkle 树做增量反熵，仅传输差异分支；结合压缩与批量推送降低开销。

## 十、小结
模式选择是带宽与收敛速度的权衡，混合模式在工程中最为常用。
