# 读一致性与线性izable读

> 对应 Gilbert & Lynch 2002（CAP 或线性一致定义）与 Ongaro & Ousterhout 2014（Raft ReadIndex 或 Lease Read）。

## 一、背景与挑战
共识保证写的一致提交，但「读」若随便读本地状态，可能读到未提交或过期数据，破坏线性一致（读应看到最新已提交写）。如何在复制系统上提供线性izable 读，是常见坑。

## 二、核心原理
三种方案：① 走完整共识（每条读当空日志项提交，最慢最安全）；② ReadIndex——Leader 确认自己仍是 Leader 且记录 commitIndex，读返回该点状态（无日志写）；③ 租约读（Leader Lease）——租约内直接本地读，因确信自己仍是主。

## 三、形式化与数学基础
线性一致要求：若读 \\(r\\) 在写 \\(w\\) 完成后开始，则 \\(r\\) 看到 \\(w\\) 的值。ReadIndex 保证读看到的 commitIndex \\(\ge\\) 所有已完成写；租约读保证租约期内无新 Leader，本地状态即最新已提交。

## 四、代码实现
```python
def read_index_read():
    # Leader 检查自身权威
    assert leader_lease_valid()
    commit = self.commit_index
    wait_until(applied_index >= commit)   # 确保已 apply
    return state_machine.read()

def lease_read():
    if now < lease_expiry:
        return state_machine.read()       # 租约内直接读
```

## 五、与其他技术对比
全共识读最稳但慢；ReadIndex 省日志写但仍需心跳确认权威；租约读最快但有小窗口风险（依赖时钟）；ZooKeeper 的 sync 加 read 类似 ReadIndex。

## 六、常见误区
1. Follower 直接读本地：可能读到未提交或过期，破坏线性一致。
2. 租约读忽略时钟漂移：漂移致双主，应设误差余量。
3. 读不等 apply：读到 commitIndex 但状态机未应用，得旧值。

## 七、与开源书/权威来源对应
Gilbert & Lynch 2002 定义线性一致；Raft 论文「Read-only queries」小节讲 ReadIndex 或 Lease；DDIA 第9章详述一致性层级。

## 八、面试题
问：Raft 如何实现线性一致读而不写日志？
答：用 ReadIndex（确认自身权威并记录 commitIndex）或租约读，读返回该提交点的已 apply 状态。

## 九、演进与趋势
结合 HLC 或 TrueTime 的「时间授权读」进一步降低延迟。

## 十、小结
线性izable 读需明确「读到最新已提交」，Raft 用 ReadIndex 或租约读在无日志开销下达成，避免盲目本地读。
