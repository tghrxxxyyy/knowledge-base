# MPTCP 连接建立与 MP_CAPABLE

> 对应 RFC 8684（MPTCP v1，取代 RFC 6824）第 3.1 节 MP_CAPABLE 子选项，以及 Kurose & Ross《Computer Networking》关于 TCP 扩展的讨论。

## 一、背景与挑战
传统 TCP 连接绑定一条路由：一个四元组、一条路径。一旦这条路径故障或拥塞，整条连接受损，且带宽受限于单一链路。现实中的设备往往同时具备多条可用链路（Wi-Fi 与蜂窝、多网卡多运营商），却无法被单个 TCP 连接利用。

MPTCP 的目标是在保留标准 TCP 应用接口不变的前提下，让一个逻辑连接横跨多条路径：既能聚合带宽，又能在某条路径失效时无缝切换，还能对中间盒保持安全。

挑战在于「起步」：两个端点如何在标准 TCP 三次握手的框架内，互相表明支持多路径、交换后续子流所需的密钥，同时不给不支持的对端与中间盒造成任何困扰？MP_CAPABLE 就是回答这个问题的握手子选项。

## 二、核心原理
MPTCP 的建连完全复用 TCP 三次握手，只是把能力协商放进 TCP 选项空间。

- SYN 阶段：发起方在 SYN 中携带 MP_CAPABLE 子选项，表明支持 MPTCP，并附带自己的 64 位密钥；选项还包含版本号与标志位。
- SYN/ACK 阶段：若对端也支持，则在 SYN/ACK 中回显 MP_CAPABLE 并附带自己的密钥。至此双方完成密钥交换。
- 密钥派生出连接标识 token：后续新子流通过 MP_JOIN 携带 token 来声明归属，实现安全加入。
- 若对端不支持或中间盒剥离了选项：握手自然退化为标准 TCP，连接照常建立，功能不受影响。
- 协商成功后，这条初始连接即成为「主子流」，承载数据并作为后续子流的锚点。

关键设计是「能力协商与降级同源」：多路径能力是「尽力而为」的增强，而非建立连接的必要条件。

## 三、形式化与数学基础
设发起方密钥为 $A$、对端密钥为 $B$，双方在握手后各持有一对密钥。连接 token 由密钥经哈希派生：

$$ token_A = H(A),\qquad token_B = H(B) $$

其中 $H$ 为约定的哈希函数，具体算法与截断长度以 RFC 8684 为准。token 用于标识连接，是 MP_JOIN 新子流的「门票」。

建连结果是一个二值决策：

$$ mode = \begin{cases} MPTCP, & \text{SYN 与 SYN/ACK 均含合法 MP\_CAPABLE} \\ TCP, & \text{otherwise} \end{cases} $$

MP_CAPABLE 选项的自描述编码保证兼容性：由于 TCP 选项遵循「kind + length + data」结构，任意不识别它的中间盒可依据 length 安全跳过：

$$ next = k + L $$

因此选项的存在不会破坏老朋友（旧中间盒），这正是「增量部署」的前提。可靠性上，逻辑连接在 $n$ 条子流下的可用概率为：

$$ P_{alive} = 1 - \prod_{i=1}^{n}(1 - q_i) $$

单路径（$n=1$）时退化为 $q_1$，体现多路径的韧性增益。

## 四、代码实现
以下为概念性伪代码，字段布局与常量以 RFC 8684 与内核实现为准。

```c
/* MP_CAPABLE 子选项（概览）：携带版本、标志与 64 位密钥 */
struct mp_capable_opt {
    uint8_t  subtype;      /* MPTCP_MP_CAPABLE */
    uint8_t  version;      /* 版本，v1 对应 RFC 8684 */
    uint8_t  flags;        /* 是否携带地址、校验和等能力位 */
    uint64_t sender_key;   /* 本方 64 位密钥 */
};
```

```c
/* 发起方：在 SYN 中通告能力 */
void mptcp_syn_options(struct tcp_sock *sk, struct mp_capable_opt *o)
{
    o->subtype    = MPTCP_MP_CAPABLE;
    o->version    = MPTCP_VERSION_1;
    o->flags      = MPTCP_CAP_FLAG_ADDR;      /* 示意：声明可提供地址 */
    o->sender_key = sk->mptcp_loc_key;        /* 本地生成的密钥 */
}
```

```c
/* 收到 SYN/ACK：校验并决定进入 MPTCP 还是降级 */
enum mptcp_mode handle_synack(struct tcp_sock *sk, const struct tcp_options *opt)
{
    if (!opt->has_mp_capable)
        return MODE_TCP;                      /* 对端不支持，透明降级 */

    if (opt->mp.version != MPTCP_VERSION_1)
        return MODE_TCP;                      /* 版本不匹配，降级 */

    sk->mptcp_rem_key = opt->mp.sender_key;   /* 保存对端密钥 */
    sk->mptcp_loc_token = mptcp_token(sk->mptcp_loc_key);
    return MODE_MPTCP;                        /* 建立主子流 */
}
```

建立成功后，初始子流成为主子流，后续 ADD_ADDR 与 MP_JOIN 都围绕它展开。

## 五、与其他技术对比

| 维度 | MPTCP | SCTP | QUIC |
| --- | --- | --- | --- |
| 承载协议 | TCP 选项扩展 | 独立 IP 协议号 132 | UDP |
| 多路径成熟度 | 成熟（RFC 8684） | 多归属支持 | 扩展标准化中 |
| 建连方式 | 复用 TCP 三次握手 | 独立四次握手 | 基于 UDP 的握手 |
| 中间盒友好度 | 高，复用 TCP | 低，常被阻断 | 中 |
| 对应用透明 | 是 | 否，需原生支持 | 否，需库支持 |

MPTCP 的差异化在于「在既有 TCP 之上做增强」：不改变寻址与端口模型，因此能在存量网络中逐步部署。

## 六、常见误区
- 误区一：MPTCP 需要应用改代码。它对标准 socket API 透明，应用无需感知。
- 误区二：任意两个 IP 都能组 MPTCP。需两端均支持且后续 MP_JOIN 成功，并受策略与中间盒约束。
- 误区三：MP_CAPABLE 一定成功。中间盒可能剥离选项，导致降级为普通 TCP。

## 七、与开源书·权威来源对应
- RFC 8684 第 3.1 节定义 MP_CAPABLE 的格式、版本与握手语义。
- RFC 6824 是 MPTCP 早期版本，已被 RFC 8684 取代，可对照其差异。
- Kurose & Ross《Computer Networking》在 TCP 章节讨论了选项扩展与协议演化。
- Linux 内核 MPTCP 文档说明了实际启用与握手行为。

## 八、面试题
1. MPTCP 如何在 TCP 三次握手内完成能力协商与向后兼容？
2. MP_CAPABLE 交换了什么？密钥的作用是什么？
3. 降级为普通 TCP 会在什么条件下发生？
4. 为什么 MPTCP 对应用透明，这与 QUIC 有何不同？
5. 初始子流在 MPTCP 中扮演什么角色？

## 九、演进与趋势
- Linux 内核主线支持 MPTCP，移动生态（如 Apple 设备）广泛用于 Wi-Fi 与蜂窝切换。

## 十、小结
MP_CAPABLE 是 MPTCP 的建连握手：它在标准 TCP 三次握手内协商多路径能力并交换密钥，失败时透明降级为普通 TCP，成功后初始连接成为承载与后续子流的锚点。正是这种「复用 TCP、能力可选」的设计，使 MPTCP 能够被广泛部署，而不必依赖全网升级。
