# 免费ARP与代理ARP

> 对应 RFC 826 (ARP) 与 RFC 1027 (Proxy ARP)。

## 一、背景与挑战
当主机 IP 地址变更、接口启用或发生故障转移时，需主动通知同网段其他主机更新缓存，否则旧映射导致通信中断。此外跨网段的某些可达场景需要路由器代为应答 ARP。

## 二、核心原理
免费 ARP（Gratuitous ARP）是发送方以自身 IP 同时作为 sender 与 target 的 ARP 请求/应答，用于宣告或冲突检测。代理 ARP（Proxy ARP）由路由器在收到查询非本网段 IP 的 ARP 时，以自身 MAC 应答，使主机误以为目标在同一链路，常用于无子网划分或移动场景。

## 三、形式化与数学基础
免费 ARP 特征：
$$ SPA = TPA = IP_{self},\quad SHA = MAC_{self} $$
代理 ARP 路由器应答条件：
$$ \text{route exists for } TPA \text{ and } TPA \notin \text{local subnet of requester} $$
并以路由器接口 MAC 作为 THA 回送。

## 四、代码实现
Linux 发送免费 ARP（接口 up 时内核自动发），手动触发可用 `arping -U`：
```bash
arping -U -I eth0 192.168.1.10
```
开启代理 ARP：
```bash
sysctl -w net.ipv4.conf.eth0.proxy_arp=1
```

## 五、与其他技术对比
免费 ARP 用于同广播域宣告，NDP 的主动地址冲突检测（DAD）与邻居通告功能更规范。代理 ARP 是一种链路层「欺骗」可达，现代多用路由而非代理。

## 六、常见误区
误区一是认为免费 ARP 只用来自检冲突，实际也用于故障转移（如 VIP 漂移）快速刷新对端缓存。误区二是代理 ARP 等同 NAT，二者机制完全不同。

## 七、与开源书/权威来源对应
RFC 826 提及广播自身映射；RFC 1027 定义 Proxy ARP；Tanenbaum 讨论代理 ARP 用途与隐患。

## 八、面试题
问：VIP 漂移后为什么发免费 ARP？答：让同网段交换机与主机立即更新 IP-MAC 映射，避免流量仍发往旧节点造成中断。

## 九、演进与趋势
数据中心用 GARP 抑制与控制器同步减少泛洪；EVPN 以控制平面通告 MAC/IP，弱化传统代理 ARP 需求。

## 十、小结
免费 ARP 主动宣告/检测地址，代理 ARP 让路由器代答以跨段可达，二者都是 ARP 机制的重要扩展，需理解其适用边界与安全影响。
