# SYN洪泛

> 对应 RFC 4987（TCP SYN Flooding Attacks and Common Mitigations）与 RFC 6528（Defending against Sequence Number Attacks / SYN Cookie）。

## 一、背景与挑战
TCP 三次握手要求服务端在收到 SYN 后，先在内存中分配一个半连接（处于 SYN_RECV 状态）并记住序列号等状态，再等待对方 ACK 完成握手。攻击者伪造大量源 IP 发送 SYN，却从不回 ACK，服务端的半连接表被迅速填满，合法用户的新连接请求因无处存放而被丢弃——这就是 SYN 洪泛。

它属于典型的 L4 协议型攻击：消耗的不是带宽，而是连接表条目与相关的内核数据结构。由于源地址被伪造，按 IP 封禁收效甚微。SYN 洪泛长期以来都是最流行的 L4 DDoS 手法之一。

## 二、核心原理
核心矛盾在于「服务端必须为尚未完成的握手保留状态」。防护思路分成两大类：消除状态、或延缓/过滤状态分配。

- SYN Cookie：服务端不在收到 SYN 时分配半连接，而是把连接参数编码进 SYN+ACK 的初始序列号；只有收到携带正确 ACK 号的第三次握手报文时，才还原信息并建立完整连接。这样半连接表在洪水下不再被占用。
- SYN 代理/网关：由中间设备替服务端完成握手，确认对端真实存在后再转发连接，把伪造源挡在外面。
- 限速与黑名单：对单位时间内的 SYN 速率设上限，配合信誉库。
- 调整内核参数：增大半连接队列与缩短超时，属于权宜之计。

## 三、形式化与数学基础
设半连接表容量为 $T$ 个条目，攻击以速率 $R_{syn}$ 注入伪造 SYN，条目超时时间为 $\tau$，则在稳态下被占用的条目数约为：

$$ Q \approx \min(T,\ R_{syn}\,\tau) $$

当 $R_{syn}\,\tau \ge T$ 时，表被占满，合法 SYN 因无空位被丢弃。这解释了为何「缩短超时 $\tau$」与「增大 $T$」只能延缓而不能根治。

SYN Cookie 的核心是构造初始序列号：

$$ seq = f\bigl(srcIP,\ dstIP,\ srcPort,\ dstPort,\ t\bigr) $$

其中 $f$ 为带密钥的单向函数（通常用加密哈希截断），$t$ 为粗粒度时间戳（用于过期判定）。服务端只保存密钥，不保存每个连接的状态。收到 ACK 后校验 $ack - 1 = seq$ 且时间 $t$ 在有效窗口内，即可重建连接。代价是部分 TCP 选项（如窗口缩放、SACK）在早期实现中无法编码，现代 Linux 实现已有相应处理。

## 四、代码实现
```bash
# Linux 开启 SYN Cookie
sysctl -w net.ipv4.tcp_syncookies=1

# 增大半连接队列上限（缓解而非根治）
sysctl -w net.ipv4.tcp_max_syn_backlog=8192

# 限制单位时间 SYN 速率，超限丢弃（粗粒度保护）
iptables -A INPUT -p tcp --syn -m limit --limit 100/s --limit-burst 200 -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP
```

```c
/* SYN Cookie 序列号构造的简化示意（非真实内核实现） */
/* 由四元组与粗粒度时间经密钥哈希生成，服务端不存半连接状态 */
uint32_t cookie = hash_mac(secret, src_ip, dst_ip, src_port, dst_port, coarse_time);
```

生产环境的队列与超时参数应以内核与发行版官方文档为准，并结合真实连接基线调优。

## 五、与其他技术对比
| 维度 | SYN Cookie | SYN 代理/网关 | 增大队列+限速 |
| --- | --- | --- | --- |
| 是否保存半连接状态 | 否 | 是（在代理上） | 是 |
| 抗表耗尽能力 | 强 | 强 | 弱 |
| 对 TCP 选项影响 | 早期有，现代较小 | 无 | 无 |
| 额外设备需求 | 无 | 需中间设备 | 无 |
| 适用场景 | 通用兜底 | 有专业清洗/负载均衡 | 轻量临时缓解 |

SYN Cookie 是操作系统自带的「零成本」防护，SYN 代理则把风险与状态转移到具备大容量与检测能力的专用设备上，二者可叠加。

内核级防护的常用参数与取舍：

- tcp_syncookies：开启 SYN Cookie，无状态处理半连接。
- tcp_max_syn_backlog：半连接队列上限，过大占用内存，过小易被打满。
- tcp_synack_retries：SYN+ACK 重传次数，影响半连接占用时长。
- tcp_abort_on_overflow：队列溢出时的处理策略，需权衡可用性与告警信号。

需要强调，这些参数只是「减缓」，无法替代上游清洗：当 SYN 洪泛带宽足以占满链路时，主机侧的一切优化都无从发挥。真正的分层是「运营商级清洗削峰 + 本机 Cookie 兜底」。

监控层面应重点跟踪三类信号：SYN_RECV 连接数的异常升高、新连接建立成功率的变化、以及单位时间 SYN 到达速率相对基线的偏离。把三者结合，可在攻击造成用户可感知影响之前触发处置。

## 六、常见误区
误区一：「SYN 洪泛只是耗带宽」。错，它主要耗尽半连接表与相关内核资源，带宽可能并不高。误区二：「关掉半连接表就安全」。错，仍会消耗 CPU 与带宽，且破坏了正常握手流程。误区三：「SYN Cookie 会丢数据」。错，正常的第三次握手能正确还原连接，不丢数据。误区四：「开了 Cookie 就万事大吉」。错，Cookie 解决表耗尽，但带宽洪泛仍需上游清洗。

## 七、与开源书·权威来源对应
- RFC 4987：TCP SYN Flooding Attacks and Common Mitigations。
- RFC 6528：Defending against Sequence Number Attacks，SYN Cookie 的标准化描述。
- Kurose & Ross《计算机网络：自顶向下方法》：TCP 连接管理与可靠传输章节。
- 图解网络：https://github.com/xiaolincoder/hello-http。
- CS-Notes：https://github.com/CyC2018/CS-Notes。

## 八、面试题
1. SYN 洪泛消耗的核心资源是什么？为什么不是带宽？
2. SYN Cookie 如何做到「无状态」防御？它把哪些信息编码进了序列号？
3. 增大半连接队列与缩短超时能否根治 SYN 洪泛？为什么？
4. SYN 代理与 SYN Cookie 在架构上有什么区别？
5. 开启时间戳选项后，SYN Cookie 的实现会有什么变化？

## 九、演进与趋势
SYN 洪泛至今仍是头号 L4 DDoS 手法，演化方向包括与反射放大结合、以及分布式低速 SYN 以规避简单阈值。防护侧趋势是硬件卸载（网卡/智能网卡直接处理握手与 Cookie 校验）、基于连接行为基线的机器学习识别，以及由清洗中心承担 SYN 代理角色。内核层面，队列自动化调优与 Cookie 的默认开启已成主流。

## 十、小结
SYN 洪泛利用「服务端必须为未完成握手保留状态」这一事实，伪造源 IP 填满半连接表。SYN Cookie 以「不在服务端存状态、把信息编码进序列号」的思路从根本上消除该依赖，是 TCP 握手层最经典的防护机制。它应与上游带宽清洗、连接限速组合，构成对协议型攻击的分层防御。
