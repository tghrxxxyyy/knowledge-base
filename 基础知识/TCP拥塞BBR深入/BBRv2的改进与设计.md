# BBRv2的改进与设计

> 对应 Cardwell 等后续 BBRv2 设计文档（Google research blog / IETF MAPRG）；实现分支见 google/bbr。

## 一、背景与挑战
BBRv1 在高丢包环境（如浅缓冲、WiFi）下会过度占用带宽，挤压基于丢包的流，且对丢包不敏感导致高重传率。BBRv2 旨在修复公平性与丢包响应。

## 二、核心原理
1. 显式建模丢包：将丢包率纳入带宽估计上限。
2. 公平性：主动向 Reno/CUBIC 类流让出带宽，目标在竞争下获得"公平份额"。
3. 更好的 Probe 调度：根据网络拥塞信号动态调节增益。

## 三、形式化与数学基础
BBRv2 引入参考速率上限：
  BtlBw_v2 = min(measured_bw, fair_bw, loss_bw)
其中 loss_bw 由丢包率 p 推导，近似：
  loss_bw <= BDP / (RTT * sqrt(p))

## 四、代码实现
// 伪代码：依据丢包修正目标速率
u32 bbr_target_rate(struct bbr *b) {
    u32 r = min(b->bw, b->fair_bw);
    if (b->loss_rate > 0)
        r = min(r, b->inflight_latest / (b->min_rtt * sqrt(b->loss_rate)));
    return r;
}

## 五、与其他技术对比
BBRv1 偏激进，BBRv2 在激进与公平之间折中，行为更接近"礼貌"的模型驱动算法。

## 六、常见误区
1. 认为 BBRv2 完全放弃带宽探测——仍保留 PROBE_BW，只是受公平性约束。
2. 期望 BBRv2 在所有场景都优于 v1——浅缓冲高丢包场景更优，纯低丢包场景差异小。

## 七、与开源书/权威来源对应
- Google BBRv2 design doc (IETF MAPRG 2019)
- google/bbr 仓库
- Cardwell et al. 2016/2017

## 八、面试题
BBRv2 相比 v1 改了什么？如何兼顾公平与带宽利用？

## 九、演进与趋势
BBRv2 已在 YouTube、Google 内部大规模部署，逐步进入主线内核。

## 十、小结
BBRv2 通过引入丢包与公平性反馈，让模型驱动算法在真实异质网络中更可持续。
