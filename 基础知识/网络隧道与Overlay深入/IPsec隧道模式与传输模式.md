# IPsec隧道模式与传输模式

> 对应 RFC 4301 (IPsec) / RFC 4303 (ESP) / RFC 2401 背景。

## 一、背景与挑战
在不安全网络上需保护 IP 通信的机密性与完整性。IPsec 提供两种模式：传输模式只保护 payload、隧道模式保护整个原始 IP 包，选择影响拓扑适配与开销。

## 二、核心原理
传输模式（Transport）保留原始 IP 头，仅加密/认证上层数据，适合主机到主机。隧道模式（Tunnel）将原始 IP 包整体作为载荷，外加新的 IP 头，隐藏内部地址与拓扑，适合网关到网关站点 VPN。AH 提供完整性验证（含 IP 头），ESP 提供加密与（可选）认证。

## 三、形式化与数学基础
ESP 封装（隧道）：
$$ outerIP \|\ ESP(SPI, Seq, IV, \text{origIP}\|payload\| pad\| padlen\| nxt), ICV $$
传输模式开销小于隧道模式（不需外层 IP 头）。安全关联 SA 由三元组标识：
$$ SA = (SPI, destIP, security\ protocol) $$

## 四、代码实现
Linux 用 strongSwan/ libreswan 配置，示例 ipsec.conf 片段：
```text
conn site
  left=192.0.2.1
  right=198.51.100.1
  type=tunnel            # 或 transport
  esp=aes256-sha256
  auto=start
```
查看 SA：
```bash
ip xfrm state
```

## 五、与其他技术对比
传输模式轻量但暴露内部地址，适合端到端；隧道模式隐藏拓扑、适合站点到站点。WireGuard 以更简 UDP 隧道提供现代替代，但概念不同。

## 六、常见误区
误区一是 AH 与 ESP 都加密，AH 不加密只认证。误区二是传输模式能跨 NAT 直用，ESP 需 NAT-T（UDP 4500）封装。

## 七、与开源书/权威来源对应
RFC 4301 体系；RFC 4303 ESP；RFC 4302 AH；Kurose & Ross 第8章简述 IPsec 模式。

## 八、面试题
问：隧道模式与传输模式最核心区别？答：隧道模式封装并保护整个原始 IP 包（新 IP 头），隐藏内部网络；传输模式只保护 payload、保留原 IP 头。

## 九、演进与趋势
IKEv2（RFC 7296）简化协商；NAT-T 成为标配；WireGuard 以简洁设计挑战传统 IPsec 复杂度。

## 十、小结
IPsec 传输模式保护端到端 payload，隧道模式保护整包并隐藏拓扑，二者配合 ESP/AH 与 IKE 提供可部署的网络安全。
