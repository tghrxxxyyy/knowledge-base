# RSM与共识关系

> 对应 Lamport 1998（Paxos）与 Ongaro & Ousterhout 2014（Raft）。

## 一、背景与挑战
RSM 本身只描述「同序命令到同状态」，但「如何让多副本就命令顺序达成共识」是独立难题，由共识算法（Paxos或Raft）解决。二者关系是：共识提供一致有序日志，RSM 在其上构建容错服务。

## 二、核心原理
共识算法保证：在不超过多数派故障下，所有正常副本对「下一条日志项是什么」达成一致（safety），且最终会进展（liveness，需部分同步假设）。RSM 把每条达成的共识结果作为一条命令 apply。

## 三、形式化与数学基础
共识函数 \\(decide(): value\\) 满足：① 非平凡（只决定提出过的值）；② 一致（所有进程决定同一值）；③ 可终止（最终决定）。RSM 将 \\(decide\\) 反复调用，每次产生日志下一项。

## 四、代码实现
```python
# 抽象：每达成一致就 append 一条命令
while running:
    cmd = leader.propose(client_req)
    if consensus.decide(cmd):
        log.append(cmd)
        commit_and_apply(cmd)
```

## 五、与其他技术对比
RSM 可建于不同共识之上（Paxos Multi、Raft、Zab）；共识也可用于非 RSM 目的（如选主）。RSM 是共识最常见的应用形态。

## 六、常见误区
1. 认为 RSM 自带容错：需共识算法支撑。
2. 混淆共识与全序广播：二者等价但表述不同。
3. 以为共识能容忍多数派故障：只能容忍小于半数的故障。

## 七、与开源书/权威来源对应
Lamport 1998 给出 Paxos；Raft 用易理解的 RSM 视角重述；FLP 1985 证明异步下共识无绝对终止保证。

## 八、面试题
问：RSM 与共识什么关系？
答：共识保证日志一致有序，RSM 在该日志上确定性重放得到一致状态。

## 九、演进与趋势
Raft 席卷工业界（etcd、Consul、TiKV）成为 RSM 加共识的事实标准实现。

## 十、小结
共识是 RSM 的引擎，RSM 是共识的载体，二者共同构成容错服务的骨架。
