# SSM源特定组播与IGMPv3

> 对应 RFC 4607 (SSM) 与 RFC 3376 (IGMPv3)。

## 一、背景与挑战
传统 ASM（任意源组播）中接收者无法选择源，可能被无关或恶意源打扰，且需 RP 维护共享树。SSM 让接收者显式指定「从哪个源接收哪个组」，简化协议并增强安全。

## 二、核心原理
SSM 使用 232.0.0.0/8 地址范围（IPv4），接收者通过 IGMPv3 的 INCLUDE 源列表表达「只收 (S,G)」。网络直接建立源树 (S,G)，无需 RP、无需 (*, G) 共享树，协议更轻、收敛更快、抗无关源。

## 三、形式化与数学基础
SSM 状态仅为源树：
$$ (S, G),\quad G \in 232.0.0.0/8 $$
主机报告过滤：
$$ INCLUDE(\{S\}) \Rightarrow \text{仅建立 } (S,G) \text{ 树} $$
不再需要：
$$ (*, G) \text{ 与 RP 注册} $$

## 四、代码实现
接收 SSM 流（指定源加入）：
```python
import socket, struct
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# 加入 (source, group)
mreq = struct.pack('4s4s', socket.inet_aton('232.0.0.1'),
                              socket.inet_aton('198.51.100.7'))
s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_SOURCE_MEMBERSHIP, mreq)
```
PIM 配置 SSM 范围：
```text
ip pim ssm range 232.0.0.0/8
```

## 五、与其他技术对比
ASM 需 RP 与共享树、易被无关源影响；SSM 无 RP、源特定、更安全简单。代价是接收者必须预先知道源地址。

## 六、常见误区
误区一是 SSM 可用任意组地址，规范限定 232/8（可配置范围）。误区二是 SSM 不需要 IGMPv3，实际必需 v3 的源过滤。

## 七、与开源书/权威来源对应
RFC 4607 定义 SSM 模型；RFC 3376 (IGMPv3) 提供源过滤；RFC 4610 讨论 SSM 主机行为。

## 八、面试题
问：SSM 为什么不需要 RP？答：接收者已显式指定源 S，路由器直接建 (S,G) 源树，省去共享树与 RP 注册过程。

## 九、演进与趋势
SSM 成为 IPTV、视频会议首选；与 PIM-SSM 配合几乎取代复杂 ASM 部署；IPv6 中 SSM 对应 FF3x::/32。

## 十、小结
SSM 以源特定、IGMPv3 源过滤和 232/8 地址实现无 RP、安全的组播，简化了部署并提升了抗干扰能力。
