# Quorum在Dynamo中的应用

> 对应 DeCandia et al. 2007（Dynamo：N/R/W 与 sloppy quorum）与 Kleppmann DDIA 第5章。

## 一、背景与挑战
Dynamo 在高可用前提下仍希望多数读能看到一致数据，于是采用可配置的 N/R/W，并在节点故障时用“sloppy quorum”临时放宽到 preference list 后续节点。

## 二、核心原理
- 默认 N=3，可设 (R,W) 为 (1,1)、(2,2)、(3,3) 等。
- 正常 quorum：R+W>N 保证强一致读。
- Sloppy quorum：目标节点不可用时，按 preference list 顺延，保证写入可达，恢复后通过 handoff 归还。

## 三、形式化与数学基础
设 N=3。取 (W=2,R=2) 满足 W+R=4>3，强一致；取 (1,1) 为最终一致。Sloppy 下实际写入节点集可能超出原始 N，但逻辑副本数仍为 N。

## 四、代码实现
# sloppy 写入：顺延到健康节点
def write_sloppy(ring, key, val, healthy, N, W):
    targets = preference_list(ring, key, N + 2)
    ok = 0
    for t in targets:
        if t in healthy and coordinate_write(t, val):
            ok += 1
        if ok >= W:
            return True
    return False

## 五、与其他技术对比
- 对比严格 quorum：sloppy 牺牲严格位置换取可用。
- 对比 Paxos：Dynamo 不保证线性一致。

## 六、常见误区
1. 混淆 sloppy 与一致性破坏——handoff 后仍需修复。
2. 误以为 N 一定等于物理节点数。

## 七、与开源书/权威来源对应
- DeCandia et al. 2007, §4.4-4.5。
- Kleppmann, DDIA, Ch.5。
- Vonng/ddia。

## 八、面试题
1. 什么是 sloppy quorum？
2. (R=1,W=1) 在 Dynamo 中意味着什么？

## 九、演进与趋势
把 sloppy 与 CRDT 结合减少 handoff 复杂度。

## 十、小结
Dynamo 用 N/R/W 把一致性变旋钮，用 sloppy quorum 换取极致可用。
