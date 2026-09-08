# ARP协议工作流程与报文格式

> 对应 RFC 826 (ARP) 与 Tanenbaum《Computer Networks》第5章。

## 一、背景与挑战
IPv4 在以太网上传输时需将下一跳 IP 解析为 MAC 地址。ARP 以广播询问、单播应答完成这一映射，但若缺乏防护会带来欺骗与广播风暴风险。

## 二、核心原理
主机查本地 ARP 缓存，未命中则广播 ARP 请求（opcode=1）含目标 IP。同网段拥有该 IP 的主机单播 ARP 应答（opcode=2）回送其 MAC。请求方缓存映射并据此封装以太网帧。ARP 是链路层之上的独立协议，以太网类型 0x0806。

## 三、形式化与数学基础
ARP 帧关键字段（28 字节不含填充）：
$$ (HTYPE=1, PTYPE=0x0800, HLEN=6, PLEN=4, OPER, SHA, SPA, THA, TPA) $$
缓存项设生存时间 $T_{arp}$，过期后需重新解析：
$$ \text{valid until } t_0 + T_{arp} $$

## 四、代码实现
Linux 查看与操作 ARP 缓存：
```bash
ip neigh show
ip neigh add 192.168.1.10 lladdr 00:11:22:33:44:55 dev eth0 nud permanent
arping -I eth0 192.168.1.1
```
发送原始 ARP 可用 `scapy`：
```python
from scapy.all import ARP, send
send(ARP(op=1, pdst='192.168.1.1'), iface='eth0')
```

## 五、与其他技术对比
IPv6 用 NDP 替代 ARP，通过组播与 ICMPv6 实现且内建安全机制；ARP 仅 IPv4 且广播、无认证。代理 ARP 让路由器代答以跨网段可达。

## 六、常见误区
误区一是认为 ARP 跨网段广播可达远端主机，实际 ARP 只在同一广播域有效，跨子网靠网关。误区二是以为 ARP 表永久有效，实则超时刷新。

## 七、与开源书/权威来源对应
RFC 826 定义 ARP 报文与处理；Tanenbaum 第5章图解 ARP 请求应答；xiaolincoder 网络笔记说明 ARP 在发包前的作用。

## 八、面试题
问：ping 同网段主机前为什么要先 ARP？答：以太网帧需填目的 MAC，未知时需 ARP 广播解析目标 IP 对应的 MAC 才能封装发送。

## 九、演进与趋势
数据中心用 ARP 抑制/代理与 NDP 优化减少广播；IPv6 全面转向 NDP，ARP 随 IPv4 长期共存但逐步被取代。

## 十、小结
ARP 通过广播请求、单播应答将 IPv4 映射到 MAC，是局域网通信的前置步骤。理解其报文与缓存机制有助于排查连通性与欺骗问题。
