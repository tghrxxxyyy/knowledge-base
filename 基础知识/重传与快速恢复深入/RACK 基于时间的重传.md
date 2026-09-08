# RACK 基于时间的重传

> 对应 RFC 8985（RACK：Time-Based Loss Detection）与 Google RACK 文档，结合 xiaolincoder/hello-http。

## 一、背景与挑战
传统的「3 个重复 ACK」与序号距离判断在乱序、多丢、尾部丢失场景下要么过激要么过钝。RACK（Recent ACKnowledgment）改用「时间」作为丢失判据：若某段发出后，比它更晚发出的段都已被确认，而它仍未确认，则判定它丢失。

## 二、核心原理
RACK 维护一个按发送时间排序的已发送段序列。每当收到一个 ACK/SACK 确认了某「最近发送」的段，就把所有发送时间早于该段、却仍未确认的段标记为丢失（在可配置的 RACK 重排序窗口内）。这天然处理了乱序（允许一定重排时间）与尾部丢失（无需等 3 dup ACK）。

## 三、形式化与数学基础
设段 x 发送时刻 t_x，最新被确认的段 y 有 t_y（且 t_y >= t_x）。若 t_now - t_x > RACK_reorder_window 且 x 仍未确认，则标记 x 丢失。RACK_reorder_window 通常 = k · RTT（k≈1），可随观测重排自适应放大。

## 四、代码实现
```python
def on_ack(seq, t_send):
    for seg in sent_older_than(t_send):
        if not acked(seg) and (now - seg.t_send) > rack_window:
            mark_lost(seg)          # 时间序判定
    maybe_retransmit()
```

## 五、与其他技术对比
3 dup ACK 是「计数序」、FACK 是「序号距离序」，二者对乱序敏感；RACK 是「时间序」，更贴近真实传播与排队。TLP（Tail Loss Probe）常与 RACK 配合，在尾部丢包时发探测避免等超时。

## 六、常见误区
误区一：RACK 完全不用 dup ACK——实现仍结合 dup ACK 作为快速触发之一。误区二：时间窗口固定——会据重排观测自适应。误区三：RACK 替代超时——超时仍是最终兜底，RACK 只是更早更准。

## 七、与开源书/权威来源对应
RFC 8985 为权威；Google RACK 设计文档；xiaolincoder/hello-http 在重传章提及；Linux 4.9+ 默认启用 RACK 与 TLPR。

## 八、面试题
RACK 为何用时间而非计数？如何避免乱序误判？与 TLP 关系？尾部丢失怎么处理？

## 九、演进与趋势
RACK 已是 Linux 默认丢失检测机制，与 SACK、TLP 协同，逐步取代纯 Reno 式 3-dupACK 判断，显著提升真实网络恢复性能。

## 十、小结
RACK 以「晚发段已确认而早发段未确认」的时间序判据检测丢失，对乱序与尾部丢失更鲁棒，是现代 TCP 丢失恢复的核心。
