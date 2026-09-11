# MPTCP 与单路径 TCP 兼容

> 对应 RFC 8684 第 3 节关于向后兼容与 fallback to TCP 的设计，以及 Kurose & Ross《Computer Networking: A Top-Down Approach》关于协议演化的讨论。

## 一、背景与挑战
互联网的现实是：大量中间盒（NAT、防火墙、负载均衡、透明代理）会改写、剥离甚至丢弃它们不认识的 TCP 选项；同时，绝大多数对端并不支持 MPTCP。一个全新的多路径协议若要求「全网升级」，就注定无法落地。

因此 MPTCP 给自己定了严苛的兼容性目标：

- 对端支持时：无缝启用多路径，聚合带宽、提升韧性。
- 对端不支持时：行为与普通 TCP 完全等价，功能不缺失、性能不劣化。
- 全程对应用透明：应用的 socket 接口（connect/read/write）语义不变，无需改一行代码。
- 对中间盒安全：未知选项必须能被安全忽略，不能引发错误解析。

只有同时满足这四点，MPTCP 才能作为 TCP 的扩展而非替代品被逐步部署。

## 二、核心原理
兼容性由「TCP 选项协商 + 透明降级」两部分共同保证。

- 选项协商：MPTCP 的能力与子流管理都通过 TCP 选项空间中的「MPTCP 子选项」承载。建连时 SYN 携带 MP_CAPABLE 表明支持，并交换密钥；只有两端都回显且密钥校验成功，才进入 MPTCP 模式。
- 透明降级：若对端忽略、或中间盒剥离了 MP_CAPABLE，握手自然退化为标准 TCP 三次握手，连接照常建立与工作，应用无感知。
- 长度字段自描述：TCP 选项遵循「kind + length + data」编码，任何不识别选项的中间盒都能依据 length 安全跳过，不会误读后续字节。
- 路径级韧性：已建立的 MPTCP 连接若某条子流路径不通，数据自动经其余子流传输，应用连接不中断。

一句话概括：MPTCP 优先尝试多路径，失败则静默退回单路径，且退回是「正常态」而非「异常态」。

## 三、形式化与数学基础
把握手协商的结果建模为一个二值决策：

$$ mode \in \{MPTCP,\ TCP\} $$

决策规则为：当且仅当两端均回显 MP_CAPABLE 且密钥交换与校验成功时进入 MPTCP，否则降级：

$$ mode = \begin{cases} MPTCP, & \text{both\_advertise} \wedge \text{key\_ok} \\ TCP, & \text{otherwise} \end{cases} $$

降级前后的接口语义等价，可表示为应用可见行为的等价关系：

$$ behavior_{MPTCP}\big|_{\text{fallback}} \equiv behavior_{TCP} $$

对中间盒而言，未知子选项被跳过的条件是长度字段自洽。设选项起始为 $k$，长度为 $L$，则解析器前进到 $k + L$，与子选项内容无关：

$$ next = k + L,\quad L \ge 2 $$

可靠性上，设连接有 $n$ 条子流，各子流可用概率为 $q_i$（独立近似），则连接可用概率为：

$$ P_{alive} = 1 - \prod_{i=1}^{n} (1 - q_i) $$

可见子流越多，整体韧性越强；而当 $n = 1$ 时退化为单路径，$P_{alive} = q_1$。

## 四、代码实现
以下为概念性伪代码，说明协商与降级逻辑，具体实现以内核与 RFC 为准。

```c
/* 发起方：尝试 MPTCP，失败则静默降级 */
enum mptcp_mode negotiate(const struct tcp_options *synack)
{
    if (!synack->has_mp_capable)
        return MODE_TCP;              /* 对端不支持，降级 */
    if (!verify_keys(synack->sender_key, synack->receiver_key))
        return MODE_TCP;              /* 密钥校验失败，降级 */
    return MODE_MPTCP;                /* 成功进入多路径 */
}
```

```c
/* 子流级容错：某子流失效时改由其余子流承载 */
void on_subflow_lost(struct mptcp_conn *c, struct subflow *s)
{
    if (c->nsubflows > 1) {
        reschedule_unacked(s);        /* 未确认数据在其它子流重传 */
    } else {
        fallback_to_single_path(c);   /* 仅剩一条即单路径，语义不变 */
    }
}
```

选项编码的自描述示例（示意）：

```c
/* 未知选项按 length 跳过，保证中间盒安全忽略 */
while (off < opt_len) {
    uint8_t kind = buf[off];
    uint8_t len  = buf[off + 1];
    if (len < 2 || off + len > opt_len) break;  /* 畸形则停止解析 */
    handle_option(kind, &buf[off], len);
    off += len;                                  /* 前进到下一选项 */
}
```

## 五、与其他技术对比

| 维度 | MPTCP | SCTP | QUIC |
| --- | --- | --- | --- |
| 传输承载 | TCP 扩展 | 独立 IP 协议号 132 | UDP |
| 中间盒穿透 | 好，复用 TCP | 差，常被阻断 | 较好 |
| 对应用透明 | 是（socket 不变） | 需原生支持 | 否，需库/应用支持 |
| 多路径能力 | 成熟（RFC 8684） | 多归属 | 扩展标准化中 |
| 部署难度 | 低到中 | 高 | 中，需库生态 |

MPTCP 的差异化定位正是「对应用透明 + 复用 TCP 端口与协议号」，这让它能在不改造应用与网络的前提下逐步部署。

## 六、常见误区
- 误区一：开了 MPTCP 就一定多路径。对端或中间盒不支持时即降级，多路径并非必然。
- 误区二：降级意味着失败。降级即标准 TCP，本来就是设计中的常态路径。
- 误区三：MPTCP 一定比 TCP 快。若瓶颈在共享链路且受耦合约束，聚合收益可能有限。

## 七、与开源书·权威来源对应
- RFC 8684 第 3 节明确规定了能力协商与 fallback to TCP 的行为。
- Kurose & Ross《Computer Networking》在 TCP 章节讨论了选项扩展与协议演化。

## 八、面试题
1. MPTCP 如何实现降级？降级发生在哪一层？
2. 为什么 MPTCP 对应用透明？这与 QUIC 的定位有何不同？
3. 中间盒剥离 TCP 选项会发生什么？

## 九、演进与趋势
- 主流操作系统内置 MPTCP（Linux 内核主线、Apple 生态），兼容路径日益普遍。

## 十、小结
MPTCP 通过 TCP 选项协商与透明降级，保证在支持时启用多路径、在不支持时完全等价于单路径 TCP，且对应用与中间盒均安全。正是这种「不破坏现有网络」的兼容性设计，使它能够在真实的异构网络中落地，而非停留在实验室原型。
