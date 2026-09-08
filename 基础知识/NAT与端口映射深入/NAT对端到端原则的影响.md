# NAT对端到端原则的影响

> 对应 RFC 2775 (Internet Transparency) 与 Saltzer 端到端论点。

## 一、背景与挑战
端到端原则主张：只有在通信端点才能完整、可靠地实现的功能，不应放在中间系统。NAT 作为中间设备改写地址，破坏了全局可达与地址稳定性，使许多端到端协议（IPsec、FTP 主动模式、P2P）需额外处理。

## 二、核心原理
NAT 使内网主机的地址对外不可路由、且随映射变化。依赖 IP 地址作为身份或会话标识的协议会失效：如 IPsec AH 校验整个 IP 头，NAT 改写后校验失败；FTP 在应用层携带 IP:端口，需 ALG 特殊处理；端到端加密虽不受 NAT 阻断，但寻址依赖穿透。

## 三、形式化与数学基础
端到端论点形式化：若功能 $F$ 的正确性只能在端点集合 $E$ 验证，则中间节点 $M \notin E$ 实现 $F$ 既不充分也不必要：
$$ \text{correct}(F) \implies \text{checkable at } E $$
NAT 位于 $M$，无法提供 $F$ 的端到端保证，只能近似并重定向。

## 四、代码实现
FTP 主动模式因 NAT 需 conntrack FTP ALG：
```bash
modprobe nf_conntrack_ftp
iptables -t nat -A PREROUTING -p tcp --dport 21 -j CT --helper ftp
```
IPsec NAT-T 将 ESP 封装入 UDP 4500 以穿越 NAT：
```bash
espinaudp enable  # NAT-T 协商
```

## 五、与其他技术对比
与代理相比 NAT 不解析应用层（除 ALG）；与纯路由相比 NAT 引入状态。IPv6 原生地址可达更贴合端到端原则，NPTv6 仅做前缀翻译且保持地址稳定。

## 六、常见误区
误区一是认为 NAT 提供安全性等同于端到端鉴权，安全来自状态过滤而非地址隐藏。误区二是以为所有协议都能被 ALG 修正，许多协议无法在无 ALG 下工作。

## 七、与开源书/权威来源对应
RFC 2775 讨论 Internet 透明性与 NAT 影响；Saltzer 等 1984「End-to-End Arguments」提出原则；Tanenbaum 第5章论 NAT 与端到端。

## 八、面试题
问：为什么 IPsec AH 不能直穿 NAT？答：AH 校验包括 IP 源/目的地址，NAT 改写地址后校验和不符导致丢弃，需用 NAT-T 或 ESP 传输模式。

## 九、演进与趋势
随着 IPv6 推进与端到端回归，NAT 在中长期或限于运营商 CGNAT 边界；应用层穿透（ICE）成为跨 NAT 的事实标准。

## 十、小结
NAT 以中间状态实现地址复用，代价是偏离端到端原则，影响依赖地址稳定性的协议。理解其影响有助于选择加密、ALG 与穿透方案。
