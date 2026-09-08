# ARP欺骗与安全防护

> 对应 vulnerabilities 文献与 SANS/业界防护实践。

## 一、背景与挑战
ARP 无认证，任何主机都可伪造应答将某 IP 映射到攻击者 MAC，实现中间人窃听或拒绝服务。在共享广播域（含 hub 或不当交换机配置）中风险尤为突出。

## 二、核心原理
攻击者持续发送免费 ARP，声称网关 IP 对应自己 MAC，使受害者流量导向攻击者。结合 IP 转发可实现透明中间人。防护手段包括静态 ARP 绑定、DAI（动态 ARP 检测，交换机校验 ARP 与 DHCP snooping 绑定库）、以及 802.1X 接入控制。

## 三、形式化与数学基础
正常映射信任模型缺乏签名：
$$ \text{trust}(SHA \to SPA) = \text{unauthenticated} $$
DAI 引入绑定表 $B$，仅当 $(SPA, SHA)$ 命中 $B$ 才放行：
$$ \text{accept ARP} \iff (SPA, SHA) \in B $$

## 四、代码实现
Linux 静态绑定防止被欺骗覆盖：
```bash
ip neigh replace 192.168.1.1 lladdr 00:aa:bb:cc:dd:ee dev eth0 nud permanent
```
检测工具示例（scapy 监听异常 ARP）：
```python
from scapy.all import sniff, ARP
sniff(filter='arp', prn=lambda p: print(p.summary()) if p[ARP].op==2 else None)
```

## 五、与其他技术对比
静态绑定简单但难维护；DAI 由网络设备执行、可扩展但需 DHCP snooping 配合；IPv6 的 NDP 有 SEND（RFC 3971）用密码学保护，比 ARP 更安全。

## 六、常见误区
误区一是交换机网络就免疫 ARP 欺骗，实际同 VLAN 内仍广播可达。误区二是 HTTPS 完全免疫，攻击者仍可做 DoS 或降级攻击。

## 七、与开源书/权威来源对应
ARP 欺骗原理见安全教材；DAI 见 Cisco/交换机安全文档；RFC 3971 定义 SEND 用于 NDP 安全。

## 八、面试题
问：如何检测 ARP 欺骗？答：监控同 IP 对应多个 MAC 的冲突、比对 DHCP snooping 绑定、启用 DAI 告警，或用 ARP 监控脚本发现异常应答。

## 九、演进与趋势
零信任与 802.1X 限制非法接入；IPv6 SEND 与加密传输降低对链路层信任；微服务用 overlay 网络隔离减小广播域。

## 十、小结
ARP 缺乏认证使其易被欺骗，防护以静态绑定、DAI 与接入控制为主。理解攻击面有助于在共享网络中部署有效缓解。
