# FACK 与重排距离

> 对应 Mathis et al. 的 FACK（Forward Acknowledgment）算法与 Linux TCP 实现，结合 xiaolincoder/hello-http。

## 一、背景与挑战
标准 Reno 用 3 个重复 ACK 触发快速重传，但在高带宽或严重乱序网络中，重复 ACK 可能源于重排而非丢包，导致过早重传（伪重传）。FACK 用 SACK 提供的「最高连续确认点」更精确地判断真正丢失。

## 二、核心原理
FACK 维护 fack 指针 = 已通过 SACK 确认的最高序列号（含乱序到达的）。据此可计算「重排距离」= fack - 最高未确认点。当某段离 fack 足够远（超过 dupthresh 且超过重排窗口）才判定真正丢失，从而减少因路径重排造成的伪快速重传。

## 三、形式化与数学基础
令 highest_sack = max 已确认序号（含 SACK 块右沿），reorder_dist = highest_sack - snd_una（累计未确认）。若某段 seq < highest_sack - reorder_window 且未被 SACK 覆盖，则判定丢失。reorder_window 随观测到的重排动态调整（fack 距离的历史最大值）。

## 四、代码实现
```python
fack = max(fack, sack_right_edge)
reorder_dist = fack - snd_una
if not sacked(lost_seq) and (fack - lost_seq) > reorder_window:
    mark_lost(lost_seq)      # 比固定 3 dupack 更稳
```

## 五、与其他技术对比
Reno 的「3 dup ACK」是固定阈值、对重排敏感；FACK 借助 SACK 的全景信息动态判断，更准确但实现复杂。RACK 后来用「时间」而非「序号距离」判断，进一步适应乱序。

## 六、常见误区
误区一：FACK 完全取代 dup ACK——它仍与 dup ACK 计数协同。误区二：重排越多越要降阈值——FACK 反而因重排增大窗口以避免误判。误区三：FACK 是独立 RFC——它是 Linux 实现中的算法扩展，非独立标准文档。

## 七、与开源书/权威来源对应
Mathis 等 FACK 论文；Linux net/ipv4/tcp_input.c 的 fack 计算；xiaolincoder/hello-http 提及重排；RFC 6675 提供标准 SACK 重传框架。

## 八、面试题
FACK 如何减少伪重传？重排距离是什么？与 3 dup ACK 比优势？为何还需 RACK？

## 九、演进与趋势
FACK 作为 Linux 启发式之一，正逐步与 RACK（基于时间的丢失判断，RFC 8985）融合，后者成为更现代、对乱序更鲁棒的方案。

## 十、小结
FACK 利用 SACK 的 fack 指针与重排距离动态判断丢失，降低了高乱序网络下的伪重传，是 SACK 时代的重要增强。
