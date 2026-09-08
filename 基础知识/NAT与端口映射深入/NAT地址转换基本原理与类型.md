# NAT地址转换基本原理与类型

> 对应 RFC 3022 (NAT) 与 RFC 2663 (IP Network Address Translator)。

## 一、背景与挑战
IPv4 地址稀缺推动在私网与公网边界部署 NAT，使多个内部主机共享少量公网地址。NAT 改写 IP 头（有时也改写端口与校验和），打破了端到端可达性原则，给 P2P、IPsec 与日志记录带来复杂性。

## 二、核心原理
Basic NAT 仅改写 IP 地址、不碰端口，需一组公网地址。NAPT（网络地址端口转换，即最常称的 NAT）同时改写 IP 与传输层端口，用「公网IP:端口」映射「私网IP:端口」，从而一个公网地址可服务数万内部会话。转换表项由出站首包创建，并用于反向入站报文的还原。

## 三、形式化与数学基础
映射可表示为五元组到外部地址端口的函数：
$$ (IP_{priv}, port_{priv}, proto, IP_{dst}, port_{dst}) \mapsto (IP_{pub}, port_{pub}) $$
NAPT 的可并发会话数受公网端口空间约束，单公网地址理论约 $2^{16}$ 个端口，实际保留部分后约数万。

## 四、代码实现
Linux 用 Netfilter/ conntrack 维护 NAT 会话，典型规则：
```bash
iptables -t nat -A POSTROUTING -s 192.168.0.0/16 -j MASQUERADE
```
conntrack 表查看：
```bash
cat /proc/net/nf_conntrack | head
```

## 五、与其他技术对比
与代理（应用层改写）相比，NAT 在三层/四层透明转换、对应用无感知但破坏端到端。IPv6 地址充足可省去 NAT，但 IPv6 仍有 NPTv6 用于前缀翻译。

## 六、常见误区
误区一是认为 NAT 等于防火墙，NAT 仅做地址转换，安全来自状态化过滤而非 NAT 本身。误区二是以为所有 NAT 都支持入站主动访问，多数 NAPT 默认不允许外部发起。

## 七、与开源书/权威来源对应
RFC 3022 定义 NAPT；RFC 2663 分类 NAT 术语；Tanenbaum《Computer Networks》第5章讨论 NAT 与端到端原则。

## 八、面试题
问：NAPT 如何用一个公网 IP 区分多台内网主机？答：以「公网IP:公网端口」唯一标识一条会话，反向报文按端口还原到对应私网主机与端口。

## 九、演进与趋势
CGNAT（运营商级 NAT，RFC 6888）在 ISP 侧进一步复用公网地址，导致多用户共享导致日志溯源困难；IPv6 普及旨在从根本上消解 NAT。

## 十、小结
NAT/NAPT 通过改写 IP 与端口实现地址复用，缓解 IPv4 短缺但牺牲端到端可达性。理解映射表与状态化特性是排障与穿透的基础。
