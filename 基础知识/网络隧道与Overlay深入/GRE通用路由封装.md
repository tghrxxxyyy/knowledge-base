# GRE通用路由封装

> 对应 RFC 2784 (GRE) 与 RFC 2890 (GRE Key)。

## 一、背景与挑战
需要一种通用机制把任意三层协议封装进 IP，以构建点对点隧道、承载多协议或穿越 IP 网络。GRE 以简单、协议无关著称，但本身不加密也不保证安全。

## 二、核心原理
GRE 在原始报文前加 GRE 头（含协议类型字段标识载荷协议，如 0x0800 为 IPv4）再外包 IP 头。可选 Key 字段用于区分同一隧道上的不同流量，Sequence 位支持排序。GRE 无内置加密，常与 IPsec 搭配提供机密性。

## 三、形式化与数学基础
GRE 头结构（简化）：
$$ (C|K|S|Reserved0|Ver, Protocol, [Checksum], [Key], [Sequence]) $$
封装长度：
$$ H_{GRE} = 4 + (\text{optional fields}) $$
外层 IP 头再加 20 字节（IPv4），总开销至少 24 字节。

## 四、代码实现
Linux GRE 隧道（含 key）：
```bash
ip tunnel add gre1 mode gre remote 198.51.100.9 local 192.0.2.9 ttl 255 key 1234
ip link set gre1 up
ip addr add 10.1.1.1/30 dev gre1
```
查看：
```bash
ip tunnel show
```

## 五、与其他技术对比
GRE 比 IP-in-IP 灵活（可承载非 IP 载荷、带 Key）；但无加密，IPsec 传输模式或 WireGuard 更适合需保密场景。VXLAN 用 UDP 封装更适合大二层 overlay。

## 六、常见误区
误区一是 GRE 自带安全，它仅封装不加密。误区二是 Key 能认证，Key 只是标识、易被伪造。

## 七、与开源书/权威来源对应
RFC 2784 定义 GRE 基础；RFC 2890 增加 Key/Sequence；运维文档广泛使用 GRE 做站点互联。

## 八、面试题
问：GRE 与 IP-in-IP 区别？答：GRE 头部带协议类型字段可封装任意三层协议并支持 Key/序列，IP-in-IP 仅封装 IP 且头更简单。

## 九、演进与趋势
GRE 仍用于站点 VPN 与协议实验；在云中逐渐被 VXLAN/Geneve 与 IPsec/WireGuard 取代；但作为轻量隧道仍广泛。

## 十、小结
GRE 以协议无关、带 Key 的通用封装实现灵活隧道，适合多协议承载与站点互联，但需配合加密机制保障安全。
