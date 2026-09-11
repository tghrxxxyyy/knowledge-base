# FACK 与重排距离

> 对应 Mathis et al. 的 FACK（Forward Acknowledgment）算法与 Linux TCP 实现，结合 xiaolincoder/hello-http。

## 一、背景与挑战
标准 Reno 用「3 个重复 ACK」触发快速重传。但在高带宽或严重乱序网络中，重复 ACK 常源于路径重排而非真正丢包——过早重传（伪重传）会浪费带宽、还触发不必要的拥塞窗口下降。FACK（Forward ACK）借助 SACK 提供的「最高连续确认点」更精确判断「真正丢失」，从而减少伪重传。

伪重传的代价不只是浪费带宽：它让发送方误以为拥塞而降速，在已经健康的链路上白白损失吞吐，这种「误判惩罚」在高速链路上是性能杀手。FACK 的设计动机正是消除它，让丢包判定「基于全景信息」而非「基于固定计数」。

可以说，FACK 是把 SACK 提供的信息「用起来」的第一步：SACK 告诉发送方「哪些收到了」，FACK 则进一步把「收到的最远处」转化为「谁该被判丢」的判据。

## 二、核心原理
FACK 维护一个 fack 指针 $=$ 已通过 SACK 确认的最高序列号（含乱序到达的段的右沿）。据此可算「重排距离」$=$ fack $-$ 最高未确认点（snd_una）。某段若离 fack「足够远」（超过 dupthresh 且超过观测到的重排窗口）才判定真正丢失。

换句话说，只要还有比它更靠后的段已被 SACK 确认，就说明它「可能只是重排晚了」，暂不打它；只有当它被远远甩在 fack 之后，才确认丢失。这比固定 3 dup ACK 更稳。

FACK 还允许更激进地推进重传：一旦确定重排距离，就可以连续重传空洞，而不必等待「每个空洞各自凑够 3 个 dup ACK」，因此在多段丢失时恢复更快。

## 三、形式化与数学基础
令 $\text{highest\_sack} = \max$（所有已确认序号，含 SACK 块右沿），$\text{reorder\_dist} = \text{highest\_sack} - \text{snd\_una}$（累计未确认点）。对某未确认段 seq：

$$ \text{if}\; (\text{highest\_sack} - seq) > \text{reorder\_window}\ \text{且 seq 未被 SACK 覆盖} \;\Rightarrow\; \text{标记丢失} $$

reorder_window 随观测到的重排距离动态调整（取历史最大重排距离或类似启发式）。距离越大越可能真丢；在重排频繁的网络，窗口自适应放大以避免误判。Linux 用 `reordering` 变量记录观测到的最大重排，并据此提高 dupthresh，使 FACK 判据更宽松、更抗乱序。

本质上，FACK 把「重排距离」作为「是否已明显越界」的度量，比单纯计数信息量更大：计数只知道「重复了几次」，距离还知道「被甩开了多远」。

## 四、代码实现
```python
fack = 0
reorder_window = 3  # 初始启发式，会随重排观测放大

def on_sack(sack_right_edge):
    global fack
    fack = max(fack, sack_right_edge)       # 推进 fack 指针
    reorder_dist = fack - snd_una
    for seg in unacked_queue:
        if not sacked(seg) and (fack - seg.seq) > reorder_window:
            mark_lost(seg)                  # 比固定 3 dupack 更稳
```

Linux 中 `tcp_ack_update_fack` 更新 fack，`tcp_detect_loss` 依据 fack 与 reorder_window 判定丢失。实际内核还会结合 `tcp_is_fack` 标志位，在启用 SACK 时启用 FACK 逻辑，否则回退到普通 Reno 计数。

fack 指针的推进严格依赖 SACK 块右沿，因此无 SACK 时 FACK 退化为经典 3-dupACK 逻辑，体现其「建立在 SACK 之上」的本质。

## 五、与其他技术对比

| 判据 | 依据 | 重排敏感度 | 实现复杂度 |
| --- | --- | --- | --- |
| 3 dup ACK | 计数 | 高 | 低 |
| FACK | 序号距离（fack） | 中（自适应窗） | 中 |
| RACK | 发送时间 | 低 | 中 |
| SACK | 已收范围 | 低（辅助） | 中 |
| TLP | 尾部探测 | — | 中 |

FACK 借 SACK 全景信息动态判断，比 Reno 准；RACK 后来用「时间」进一步适配乱序，成为更现代的默认。FACK 与 RACK 并非替代关系：FACK 的距离信息仍作为 RACK 的辅助证据，二者在现代 Linux 中并存于同一恢复路径，分别在不同维度上提供判据。

## 六、常见误区
- 误区一：FACK 完全取代 dup ACK。它仍与 dup ACK 计数协同，作为触发之一。
- 误区二：重排越多越要降阈值。FACK 反因重排增大窗口以避免误判，逻辑与直觉相反。
- 误区三：FACK 是独立 RFC。它是 Linux 实现中的算法扩展，非独立标准文档（标准框架见 RFC 6675）。
- 误区四：fack 等于累积 ACK。fack 通常远大于 snd_una，因为它含乱序已收段。
- 误区五：FACK 已淘汰。它仍是 Linux 丢失判据的重要组成，与 RACK 并存而非被删除。
- 误区六：重排窗口是常量。它随观测自适应放大，是动态量。
- 误区七：FACK 能处理尾部丢失。与 SACK 一样，尾部无后续段时仍需 RACK/TLP。

## 七、与开源书·权威来源对应
Mathis 等的 FACK 论文提出前向确认思想；Linux `net/ipv4/tcp_input.c` 计算 fack 与重排距离；xiaolincoder/hello-http 提及重排场景；RFC 6675 提供标准 SACK 重传框架，FACK 是其上的 Linux 启发式增强。Kurose & Ross 在可靠传输章讨论乱序对 Go-Back-N 类协议的影响，与 FACK 动机相通——都是为了让「乱序」不再被误当作「丢包」。

具体实现与变量命名以对应内核版本的官方文档为准。

## 八、面试题
- 问：FACK 如何减少伪重传？答：用 fack 与重排窗口判断，重排导致的 dup ACK 不触发重传。
- 问：重排距离是什么？答：highest_sack 与 snd_una 之差，衡量「被甩在后面多远」。
- 问：与 3 dup ACK 比优势？答：动态、基于全景 SACK 信息，对乱序更鲁棒。
- 问：为何还需 RACK？答：FACK 仍基于序号距离，乱序极严重时不如时间序稳。
- 问：reorder_window 怎么来？答：由观测到的历史最大重排距离自适应确定。
- 问：无 SACK 时 FACK 如何工作？答：退化为经典 3-dupACK 计数逻辑。
- 问：FACK 能否处理尾部丢失？答：不能，仍需 RACK/TLP 补足。

## 九、演进与趋势
FACK 作为 Linux 启发式之一，正逐步与 RACK（基于时间的丢失判断，RFC 8985）融合：后者成为更现代、对乱序更鲁棒的方案，FACK 的距离信息仍被用于辅助。整体方向是「以时间为主、序号距离为辅」，并在 BBR 等模型中与带宽探测共享状态。

未来可能把重排距离估计做得更精确，进一步降低高速链路的伪重传率。相关演进以官方最新文档为准。

fack 与 snd_una 的关系值得反复强调：snd_una 是累积确认点，fack 是「曾见过的最远确认」，二者之差正是重排距离；无 SACK 时 fack 无法推进，整个判据只能退化为计数。

重排窗口不是常量，而是由内核用 `reordering` 等变量记录历史最大重排后自适应调整的；高乱序链路会自动放宽判据，从而少误判、少伪重传。

与 NewReno 相比，NewReno 靠部分确认在一个窗口内逐段恢复，而 FACK 能用距离一次性判定多个空洞；在多段丢失场景下，后者的恢复效率明显更高。

从实践影响看，在乱序轻微的数据中心内网，FACK 带来的收益有限；而在跨洲、无线等重排频繁的链路上，它显著降低了伪重传与不必要的窗口抖动。

## 十、小结
FACK 利用 SACK 的 fack 指针与重排距离动态判断丢失，降低高乱序网络下的伪重传，是 SACK 时代的重要增强，现已与 RACK 协同成为 Linux 丢失恢复的一部分。理解重排距离，是读懂高带宽链路为何需要比「3 dup ACK」更聪明的判据的关键，也是从「计数式丢包检测」走向「信息式丢包检测」的一步。
