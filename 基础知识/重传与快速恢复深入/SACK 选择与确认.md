# SACK 选择与确认

> 对应 RFC 2018（SACK 选项）与 RFC 6675（SACK 重传算法），以及 xiaolincoder/hello-http 的相关说明。

## 一、背景与挑战
标准 ACK 只能确认连续字节流前缀，当多个不连续段丢失时，发送方无法得知哪些已收到、只能盲目重传。选择性确认（SACK）让接收方汇报「已收到但不连续」的块，发送方据此精准重传。

## 二、核心原理
接收方在 TCP 选项里携带 SACK 块（[left, right] 字节范围），报告已收但超出累积 ACK 的洞外数据。发送方维护「记分板（scoreboard）」记录哪些段已确认，只重传真正丢失的段，避免对已达段重传，显著提升多丢场景吞吐。

## 三、形式化与数学基础
SACK 块为有序不重叠区间集合 B = {[l_i, r_i)}，累积 ACK 为 a。未确认区间 U = [a, send_high) \ (∪ B)。重传只需覆盖 U 中的段。RFC 6675 的 pipe 算法估算「在途未确认」以决定还能发多少。

## 四、代码实现
```c
/* 接收方构造 SACK 选项（内核伪代码） */
skb_put_sack(skb, start_seq, end_seq);
/* 发送方：仅重传未覆盖段 */
for seg in unacked:
    if not covered_by_sack(seg) and not retransmitted_recently:
        retransmit(seg)
```

## 五、与其他技术对比
无 SACK 时（仅 dup ACK）发送方只能猜测，易重传已收到的段；SACK 把「猜」变成「知」。D-SACK（RFC 2883）扩展 SACK 以报告重复接收，帮助检测虚假重传与 ACK 丢失。

## 六、常见误区
误区一：SACK 替代累积 ACK——不，累积 ACK 仍在，SACK 是补充。误区二：SACK 越多越好——选项空间有限，最多约 3 个块。误区三：SACK 自动开启——需两端协商支持。

## 七、与开源书/权威来源对应
RFC 2018 定义 SACK；RFC 6675 定义基于 SACK 的重传；xiaolincoder/hello-http 展示多丢恢复；Kurose & Ross 提及选择性重传。

## 八、面试题
SACK 与累积 ACK 区别？D-SACK 用途？为何 SACK 块数有限？SACK 如何提升多丢吞吐？

## 九、演进与趋势
RACK 与 SACK 协同：SACK 提供精确信息，RACK 用时间序处理重排与尾部丢失；Linux 默认启用 SACK（除非与某些中间件不兼容需关闭）。

## 十、小结
SACK 通过选择性确认使发送方精准重传，是多段丢失场景下维持高吞吐的核心机制，配合 RFC 6675 记分板实现高效恢复。
