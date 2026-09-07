# ChandyLamport算法

> 对应 Chandy & Lamport 1985（Distributed Snapshots: Determining Global States of Distributed Systems）与 mit-pdos/6.824 讲义（Lab 3 快照）。

## 一、背景与挑战
分布式系统没有全局时钟，单看各节点本地状态无法构成一致的全局视图。如何无中断地记录一个“逻辑上同时”的全局状态？Chandy-Lamport 给出基于标记（marker）的算法。

## 二、核心原理
- 发起者记录自身状态，向所有出边发送 marker。
- 进程首次收到某通道的 marker 时，记录自身状态并开始记录该通道（记为空），并向其他出边转发 marker。
- 之后收到同通道消息则记入通道状态，直到该通道的 marker 到达后停止记录。
- 所有进程与通道状态集齐即构成一致快照。

## 三、形式化与数学基础
算法保证记录的状态满足“通道因果一致性”：对每条通道，记录的通道消息集合恰好是“在快照前发出、快照后到达”的消息，从而全局状态无丢失/重复。时间复杂度 $O(|V|+|E|)$ 个 marker。

## 四、代码实现
# 进程侧快照示意
class Proc:
    def on_marker(self, ch, snap):
        if not snap.recording:
            snap.record_self(self.state)
            snap.recording = True
            for c in self.out_channels:
                c.send(MARKER)
            snap.channel[ch] = []   # 开始记录
        else:
            snap.channel[ch] = "done"

## 五、与其他技术对比
- 对比全局停顿（stop-the-world）：CL 不中断系统。
- 对比基于时钟的快照：CL 不依赖物理时钟同步。

## 六、常见误区
1. 以为 marker 会破坏正常消息顺序——实际只是旁路标记。
2. 忽略通道状态记录导致快照不一致。

## 七、与开源书/权威来源对应
- Chandy & Lamport 1985。
- mit-pdos/6.824 Lecture & Lab 3。
- Coulouris, Distributed Systems, Ch.14。

## 八、面试题
1. Chandy-Lamport 如何保证通道状态一致？
2. marker 的作用是什么？

## 九、演进与趋势
扩展到非 FIFO 通道（需序列号）与异步快照（Flink）。

## 十、小结
Chandy-Lamport 用 marker 在不停止系统的情况下捕获一致的全局状态。
