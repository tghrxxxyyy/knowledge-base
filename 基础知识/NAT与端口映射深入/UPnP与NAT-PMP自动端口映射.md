# UPnP与NAT-PMP自动端口映射

> 对应 UPnP IGD 标准 与 RFC 6886 (NAT-PMP) / RFC 7650 (PCP)。

## 一、背景与挑战
内网服务（游戏、P2P、监控）需要外部主动访问，但 NAPT 默认阻断入站。手动配置端口转发繁琐，UPnP IGD 与 NAT-PMP/PCP 让主机自动向网关请求映射，实现即插即用可达。

## 二、核心原理
UPnP IGD 通过 SSDP 发现网关，再用 SOAP 调用 `AddPortMapping` 建立外部端口到内网 IP:端口的静态映射。NAT-PMP 由 Apple 提出，主机向网关组播地址发请求获知公网地址并申请端口映射，更轻量；其继任者 PCP（RFC 6887）支持 IPv6 前缀与更丰富语义。

## 三、形式化与数学基础
映射请求可表示为：
$$ \text{Map}(IP_{int}, port_{int}, proto, \text{lifetime}) \to (IP_{ext}, port_{ext}) $$
映射有效期 $T$ 需周期续约：
$$ \text{renew at } t < T_{expire} $$
失效后映射自动删除，避免长期占用。

## 四、代码实现
Python 使用 `miniupnpc` 自动映射：
```python
import miniupnpc
u = miniupnpc.UPnP()
u.discoverdelay = 200
u.selectigd()
u.addportmapping(8080, 'TCP', u.lanaddr, 8080, 'my service', '')
```
NAT-PMP 常用 `libnatpmp` 客户端调用。

## 五、与其他技术对比
UPnP IGD 功能全但实现复杂、历史上多安全漏洞；NAT-PMP/PCP 更简单、由网关主动通告公网地址。手动端口转发最可控但无自动回收。

## 六、常见误区
误区一是开启 UPnP 一定方便且安全，UPnP 曾被广泛利用做恶意映射，应在不信任网络关闭。误区二是映射永久有效，实际需续约。

## 七、与开源书/权威来源对应
RFC 6886 定义 NAT-PMP；RFC 6887 定义 PCP；UPnP Forum「Internet Gateway Device」标准；xiaolincoder 笔记提及穿透与端口映射。

## 八、面试题
问：UPnP 与 NAT-PMP 区别？答：UPnP IGD 基于 SSDP+SOAP 较复杂且易有漏洞；NAT-PMP/PCP 更轻量、由网关通告公网地址并支持续约。

## 九、演进与趋势
PCP 正逐步取代 NAT-PMP 与 UPnP，支持 CGNAT 与 IPv6 前缀映射；安全加固要求默认关闭 UPnP 并显式授权。

## 十、小结
UPnP IGD、NAT-PMP、PCP 让内网主机自动建立端口映射实现入站可达，适合 P2P 与家庭服务，但需权衡便利与安全，并理解续约与回收语义。
