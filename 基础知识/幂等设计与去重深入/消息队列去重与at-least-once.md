# 消息队列去重与at-least-once

> 对应 DDIA 第11章（流处理）与 Kafka 官方文档。

## 一、背景与挑战
Kafka 等系统默认提供 at-least-once 投递：消息可能重复（生产者重试、消费者重平衡后重放）。消费者若做「非幂等副作用」（写库、发钱），重复消费即灾难。必须在消费端配合幂等。

## 二、核心原理
两种去重路径：① 生产者端幂等（Kafka 的 `enable.idempotence`，用 producer id 加序列号保证分区内无重复）；② 消费者端用「处理位移加业务幂等键」确保同一消息多次消费效果一致。常用「消费位移与业务写在同一事务」实现精确一次（EOS）。

## 三、形式化与数学基础
设消息 \\(m\\) 有 producer 序列号 \\(s\\)，broker 维护每分区 last_seq，仅接受 \\(s = last\_seq+1\\)，丢弃 \\(s\le last\_seq\\)，从而保证分区内有序且无重复。

## 四、代码实现
```python
# Kafka 消费者：用幂等键去重
def on_message(msg):
    if msg.key in processed_cache:
        return  # 已处理
    with db.transaction():
        db.write(business(msg))
        db.mark_offset(msg.topic_partition, msg.offset)
```

## 五、与其他技术对比
at-most-once 可能丢消息；at-least-once 加幂等 = 实际精确一次；Kafka 事务性 EOS 把位移与写绑定。

## 六、常见误区
1. 认为 at-least-once 不会重复：正因可能重复才需幂等。
2. 消费位移提交与业务写不在同一事务：可能重复或丢失。
3. 用消息 offset 当业务幂等键：重平衡后 offset 语义不稳。

## 七、与开源书/权威来源对应
DDIA 第11章详述流处理精确一次与幂等 sink；Kafka 文档讲 idempotent producer 与 EOS。

## 八、面试题
问：at-least-once 如何实现精确一次？
答：配合幂等消费（或事务性位移加写），使重复处理无副作用。

## 九、演进与趋势
Flink 等引擎内建 exactly-once checkpoint 与两阶段提交 sink。

## 十、小结
队列层的重复是常态，消费端幂等加事务位移是精确一次的关键。
