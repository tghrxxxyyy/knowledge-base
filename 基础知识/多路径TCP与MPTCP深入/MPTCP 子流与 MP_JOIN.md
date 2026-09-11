# MPTCP 子流与 MP_JOIN

> 对应 RFC 8684《TCP Extensions for Multipath Operation with Multiple Addresses》第 3.2 节 MP_JOIN 子选项，以及 Kleppmann《Designing Data-Intensive Applications》关于冗余路径与故障切换的讨论。

## 一、背景与挑战
MPTCP 的逻辑连接是「一个连接、多条路径」。当设备从 Wi-Fi 切换到蜂窝、或希望额外利用一条链路聚合带宽时，就需要在既有连接上动态加入新的网络路径。这条新路径通常对应一个新的四元组（源 IP:端口，目的 IP:端口），因此必须以一条新的 TCP 连接为载体。

问题随之而来：新建立的这条 TCP 连接，凭什么被认定为「属于某个已经存在的 MPTCP 连接」，而不是一次无关的连接？如果任何第三方都能把子流挂到别人的连接上，攻击者就能劫持或污染数据流。MP_JOIN 正是为解决「安全地关联新子流」而设计的子选项。

此外，子流的生命周期必须独立于连接：某条路径断开不应导致整个逻辑连接断开，剩余子流应无缝接管。

## 二、核心原理
MP_JOIN 的核心是「用建连时交换的密钥，证明发起方确实掌握原连接的秘密」。

- 初始连接在建连握手时通过 MP_CAPABLE 交换了双方的密钥（key），并由密钥派生出标识连接的 token。
- 当需要新增子流时，发起方对目标地址发起一次普通的 TCP 三次握手，在 SYN 中携带 MP_JOIN 子选项，内含该连接的 token 与一个随机数。
- 对端收到后，用本地保存的密钥对随机数做 HMAC 校验，确认发起方掌握密钥，从而认可这条新子流的归属。
- 校验通过后，双方还交换彼此的地址 ID（address ID），用于后续在地址变更时引用这条子流。
- 子流被接纳后，其承载的字节通过数据序列映射（DSN）汇入统一的逻辑字节流；子流可随时增删，映射层负责把各子流字节拼回有序流。

关键点在于：子流是独立的 TCP 连接，拥有各自的序号空间、ACK 与拥塞控制，但在 MPTCP 层被统一编排。

## 三、形式化与数学基础
设初始连接交换的密钥为 $K_A$（发起方）与 $K_B$（对端）。连接 token 由密钥派生：

$$ token = H(K) \bmod 2^{32} $$

其中 $H$ 是约定的哈希函数（RFC 8684 规定了具体算法，以官方文档为准）。MP_JOIN 的认证过程为：

$$ \text{accept} \iff token_{recv} = token_{local} \ \wedge\ \mathrm{HMAC}(K,\ r) = mac_{recv} $$

其中 $r$ 是发起方选择的随机数。第二条保证发起方掌握密钥 $K$，防止第三方伪造加入；随机数保证每次加入的认证值不同，抵御重放。

数据映射以 DSN（Data Sequence Number，全局逻辑序号）统一排序。若子流 $s$ 上的子流序号区间 $[ssn_a, ssn_b)$ 映射到逻辑区间：

$$ [ssn_a, ssn_b) \mapsto [dsn_a,\ dsn_a + (b - a)) $$

接收方按 DSN 重组，因此子流乱序或丢包只影响该子流的映射片段，其他子流照常推进。整体吞吐上界为各子流可用带宽之和：

$$ BW_{total} \le \sum_{i=1}^{n} BW_i $$

而端到端时延由最快可用路径决定，这正是多路径相对单路径的收益来源。

## 四、代码实现
以下为概念性伪代码，用于说明字段与流程，实际实现以内核与 RFC 为准。

```c
/* 发起方：新子流 SYN 携带 MP_JOIN 子选项 */
struct mp_join_syn {
    uint8_t  subtype;      /* MPTCP_MP_JOIN */
    uint8_t  backup;       /* 是否作为备用路径标志 */
    uint32_t token;        /* 来自 MP_CAPABLE，标识所属连接 */
    uint32_t random;       /* 随机数，参与 HMAC */
};
```

```c
/* 对端：校验子流归属，通过则接受并分配 address_id */
bool mp_join_accept(struct mptcp_conn *c, const struct mp_join_syn *j)
{
    uint32_t rnd = ntohl(j->random);
    uint8_t  mac[HMAC_LEN];

    if (ntohl(j->token) != c->local_token)
        return false;                       /* token 不匹配，拒绝 */

    hmac_sha256(c->key, sizeof(c->key), &rnd, sizeof(rnd), mac);
    if (memcmp(mac, j->hmac, HMAC_LEN) != 0)
        return false;                       /* 无密钥，疑似伪造加入 */

    c->nsubflows += 1;                      /* 接纳新子流 */
    return true;
}
```

子流增删的状态维护（概念示意）：

```c
void subflow_closed(struct mptcp_conn *c, struct subflow *s)
{
    list_del(&s->node);
    c->nsubflows -= 1;
    if (c->nsubflows > 0)
        schedule_retransmit_on_remaining(c);  /* 剩余子流接管 */
    else
        mptcp_conn_teardown(c);               /* 无子流可用才断开 */
}
```

## 五、与其他技术对比

| 维度 | MPTCP 子流 | SCTP multi-homing | 应用层多连接 |
| --- | --- | --- | --- |
| 关联粒度 | 独立 TCP 连接，归属逻辑连接 | 多 IP 归属同一关联 | 每个连接独立 |
| 拥塞控制 | 每子流独立，但有耦合 | 关联级 | 各自独立 |
| 对应用透明 | 是 | 需原生支持 | 否，业务参与 |
| 中间盒穿透 | 复用 TCP，较好 | 协议号 132，常受阻 | 好 |
| 路径切换韧性 | 子流独立，切换无损 | 支持 | 需业务实现 |

MPTCP 的独特之处在于：子流是完整独立的 TCP 连接，因此可各自适配异构路径的 RTT 与丢包特性，同时由映射层统一收口。

## 六、常见误区
- 误区一：子流就是多线程。子流是独立 TCP 连接，归属同一 MPTCP 连接，与线程模型无关。
- 误区二：加入子流无需认证。MP_JOIN 用 HMAC 证明发起方掌握原密钥，否则连接可被劫持。
- 误区三：某条子流断开则整条连接断开。只要还有存活子流，连接照常工作，这是韧性的来源。

## 七、与开源书·权威来源对应
- RFC 8684 第 3.2 节定义了 MP_JOIN 子选项的格式与认证流程，并取代 RFC 6824。
- Linux 内核 MPTCP 实现文档描述了子流管理与调度器的配置方式。

## 八、面试题
1. MP_JOIN 如何把新子流关联到原有 MPTCP 连接？
2. token 从何而来？为什么需要 HMAC 校验随机数？
3. 一条子流失效会怎样？连接层如何保证不中断？

## 九、演进与趋势
- Linux 内核主线支持 MPTCP，可通过 iproute2 或 eBPF 配置子流策略（如「优先 Wi-Fi」）。

## 十、小结
MP_JOIN 用密钥与 HMAC 认证，把新建立的 TCP 子流安全地挂入既有 MPTCP 连接，实现路径的动态增删与透明聚合。子流独立承载、映射层统一收口，是 MPTCP 既能适配异构路径、又能在单条路径失效时保持连接不中断的关键机制。
