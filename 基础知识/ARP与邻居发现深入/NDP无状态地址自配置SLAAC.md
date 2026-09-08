# NDP无状态地址自配置SLAAC

> 对应 RFC 4862 (SLAAC) 与 RFC 4861 (NDP)。

## 一、背景与挑战
为让主机无需 DHCPv6 服务器即可联网，SLAAC 利用 RA 通告的前缀自动生成 IPv6 地址。挑战在于地址唯一性、隐私与可路由性之间的平衡。

## 二、核心原理
主机收到 RA 中的前缀（如 /64）后，将接口标识符拼接生成全球单播地址，并发送 NS 做重复地址检测 DAD（探测地址是否已被占用）。RFC 4941 隐私扩展在每次配置时随机生成临时地址用于 outbound，RFC 7217 提供稳定但非基于 MAC 的语义地址以防跟踪。

## 三、形式化与数学基础
地址生成：
$$ A = prefix(64) \,\|\, IID $$
DAD 检测：发送目标地址为 $A$ 的 NS，若无 NA 回应则可用：
$$ \text{use } A \iff \neg \exists\, NA(A) $$
临时地址生命周期受 preferred_lifetime 限制并定期更换。

## 四、代码实现
Linux 控制 SLAAC 与隐私扩展：
```bash
sysctl -w net.ipv6.conf.eth0.autoconf=1
sysctl -w net.ipv6.conf.eth0.use_tempaddr=2
ip addr show dev eth0 | grep inet6
```
触发 RS 请求：
```bash
rdisc6 eth0
```

## 五、与其他技术对比
有状态 DHCPv6 可集中管理地址与 DNS，SLAAC 无需服务器但默认不分配 DNS（需 RA 的 RDNSS，RFC 6106）。两者可并用：SLAAC 管地址、DHCPv6 管其他配置。

## 六、常见误区
误区一是认为 SLAAC 一定会暴露 MAC（EUI-64 才如此，隐私/稳定地址不暴露）。误区二是以为 SLAAC 完全不需要任何服务器，DNS 仍可能需 RDNSS 或 DHCPv6。

## 七、与开源书/权威来源对应
RFC 4862 定义 SLAAC 与 DAD；RFC 4941 隐私扩展；RFC 7217 稳定地址；xiaolincoder 笔记提及 IPv6 地址生成。

## 八、面试题
问：SLAAC 如何保证地址不冲突？答：通过 DAD，配置前发 NS 探测该地址，若收到 NA 说明冲突则放弃并重新生成。

## 九、演进与趋势
隐私扩展成为移动设备默认；稳定地址兼顾服务器可预期性；RDNSS 使纯 SLAAC 组网更完整。

## 十、小结
SLAAC 借助 RA 前缀与主机的接口标识符自动配置 IPv6 地址，并以 DAD 保证唯一、以隐私/稳定扩展平衡隐私与可管理性。
