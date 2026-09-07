# 快照在Flink中的应用

> 对应 Carbone et al. 2015（Apache Flink: Stream and Batch Processing at Scale，异步屏障快照 ABS）与 Apache Flink 官方文档。

## 一、背景与挑战
流处理系统需周期性对算子状态做检查点（checkpoint）以实现 Exactly-Once。Chandy-Lamport 在流式中演变为“异步屏障快照”，要求不阻塞数据处理。

## 二、核心原理
- JobManager 向 source 注入屏障（barrier，相当于 marker）。
- 算子收到所有输入屏障后，异步将状态刷到持久化存储，再向下游转发屏障。
- 对齐（alignment）保证屏障前后的数据不混，构成一致快照。

## 三、形式化与数学基础
设算子有 k 个输入，需等待全部 k 个输入通道的屏障到达（对齐），期间缓冲先到通道的数据。对齐保证快照边界与 barrier 重合，等价于 CL 的一致 cut。

## 四、代码实现
# 屏障对齐示意
def on_barrier(self, input_id, checkpoint_id):
    self.pending.add(input_id)
    if self.pending == self.inputs:
        self.async_checkpoint()      # 刷状态
        for o in self.outputs:
            o.send_barrier(checkpoint_id)

## 五、与其他技术对比
- 对比 Chandy-Lamport：Flink 用 barrier 代替 marker，且可异步刷盘。
- 对比 Spark 微批：Flink 是连续流原生快照。

## 六、常见误区
1. 对齐导致反压时检查点变慢。
2. 误以为 barrier 会丢失数据。

## 七、与开源书/权威来源对应
- Carbone et al. 2015, Flink。
- Apache Flink Docs: State & Fault Tolerance。
- Chandy & Lamport 1985。

## 八、面试题
1. Flink 的 barrier 对齐起什么作用？
2. 异步快照如何不阻塞处理？

## 九、演进与趋势
非对齐检查点（unaligned checkpoint）缓解反压下对齐瓶颈。

## 十、小结
Flink 把 CL 算法工程化为流式 Exactly-Once 的基石。
