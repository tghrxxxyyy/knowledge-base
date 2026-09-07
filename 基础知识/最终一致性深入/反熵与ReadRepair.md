# 反熵与ReadRepair

> 对应 DeCandia et al. 2007（Dynamo：Anti-Entropy & Read Repair）与 Kleppmann DDIA 第5章。

## 一、背景与挑战
最终一致系统如何保证副本最终收敛？两大机制：后台反熵（主动比对修复）与前台读修复（read 时顺带修复）。

## 二、核心原理
- 反熵：节点间周期性用 Merkle 树比对 key 范围，把差异推给对方。
- 读修复：读时取 R 个副本，若发现版本不一致，把最新版本写回陈旧副本。
- 二者结合缩短“不一致窗口”。

## 三、形式化与数学基础
设副本陈旧概率 p，反熵周期 T_a，读频率 f。读修复使陈旧副本在被读时立即修复；平均不一致窗口约 $\approx \frac{1}{f} + T_a$，降低修复时延。

## 四、代码实现
# 读修复
def read_repair(key, R):
    vers = [r.get(key) for r in pick(R)]
    latest = max(vers, key=lambda v: v.clock)
    for r in vers:
        if r.clock != latest.clock:
            r.put(key, latest)
    return latest

## 五、与其他技术对比
- 对比仅反熵：读修复降低用户可见不一致。
- 对比同步复制：仍是非阻塞、最终一致。

## 六、常见误区
1. 反熵频率过高造成网络压力。
2. 读修复只在 R 个副本内，未覆盖全部。

## 七、与开源书/权威来源对应
- DeCandia et al. 2007, §4.5-4.6。
- Kleppmann, DDIA, Ch.5。
- Cassandra 文档 Read Repair。

## 八、面试题
1. 反熵与读修复的区别？
2. Merkle 树在反熵中的作用？

## 九、演进与趋势
用 CRDT 让修复变成无冲突合并，简化逻辑。

## 十、小结
反熵保证后台收敛，读修复保证前台体验，二者缺一不可。
