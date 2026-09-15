# SSM源特定组播与IGMPv3

> 对应 RFC 4607（Source-Specific Multicast, SSM）与 RFC 3376（Internet Group Management Protocol, Version 3）。

## 一、背景与挑战

传统 ASM（任意源组播）中接收者只指定组 $G$、不指定源，可能被无关或恶意源打扰，且必须维护 RP 与共享树（*, G），协议复杂、收敛慢、易出问题。SSM 让接收者显式指定「从哪个源 $S$ 收哪个组 $G$」，即只收 $(S,G)$。这既增强安全性（拒收非指定源），又简化协议（无需 RP、无需 *, G 共享树）。其支撑技术是 IGMPv3 的源过滤能力——没有 v3，SSM 在接入段就无法表达「只要这个源」。

## 二、核心原理

SSM 使用 IPv4 `232.0.0.0/8`（可配置范围）作为组地址。接收者通过 IGMPv3 的 `INCLUDE` 源列表表达「只收这两个源」，或 `EXCLUDE` 表达「收除这些源外所有源」。对 SSM，网络只用 `INCLUDE` 建立 $(S,G)$ 源树：接收者 DR 直接向源 $S$ 发 `(S,G)` Join，沿单播路由反向（RPF）建立源树，无需 RP、无需 `(*, G)` 状态。协议更轻、收敛更快、天然抗无关源与某些组播 DoS。PIM-SSM 模式下路由器收到 (S,G) Join 后直接建源树，完全跳过 RPT/Register 流程。

## 三、形式化与数学基础

SSM 转发状态仅为源树（无共享树、无 RP）：

$$ (S, G),\quad G\in 232.0.0.0/8 $$

主机报告过滤模式：

$$ INCLUDE(\{S_1,\dots,S_k\}) \Rightarrow \text{仅建立对应 }(S_i,G)\text{ 树} $$
$$ EXCLUDE(\{S_1,\dots\}) \Rightarrow \text{建立 }(*,G)\text{ 但排除指定源（ASM 语义）} $$

SSM 不再需要：

$$ (*, G)\ \text{与 RP 注册} $$

RPF 检查仍作用于 $(S,G)$ 入接口（见组播分发树篇），保证无环且朝向源。由于无 RP，状态复杂度从「每组成立 (*,G) + 各 (S,G)」降到「仅 (S,G)」，显著减少控制面负担：

$$ |state_{SSM}| = |\{\,(S,G)\,\}| \ll |\{\,(*,G)\,\}|+|\{\,(S,G)\,\}| = |state_{ASM}| $$

## 四、代码实现

```python
# 接收 SSM 流：指定源加入（Python，IPv4）
import socket, struct
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# IP_ADD_SOURCE_MEMBERSHIP: {组(4B), 源(4B), 接口(4B)}
mreq = struct.pack('4s4s4s',
                   socket.inet_aton('232.0.0.1'),
                   socket.inet_aton('198.51.100.7'),   # 指定源 S
                   socket.inet_aton('0.0.0.0'))
s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_SOURCE_MEMBERSHIP, mreq)
```

PIM 侧声明 SSM 范围：

```text
ip pim ssm range 232.0.0.0/8
```

## 五、与其他技术对比

| 维度 | ASM（任意源） | SSM（源特定） |
| --- | --- | --- |
| 接收者指定 | 仅组 $G$ | 源 $S$ + 组 $G$ |
| 是否需 RP | 是 | 否 |
| 抗无关源 | 弱 | 强（只收指定源） |
| 协议复杂度 | 高（*,G + SPT） | 低（仅 (S,G)） |
| 代价 | — | 接收者须预知源地址 |

ASM 需 RP 与共享树、易被无关源影响；SSM 无 RP、源特定、更安全简单，代价是接收者须预先知道源地址，无法「加入组后被动发现所有源」。

## 六、常见误区

1. 以为 SSM 可用任意组地址——规范限定 `232/8`（实际部署可用 `ssm range` 配置，但默认 232/8）。
2. 以为 SSM 不需要 IGMPv3——实际必需 v3 的 `INCLUDE` 源过滤；v1/v2 不支持。
3. 以为 SSM 完全不用 RP——纯 SSM 确实不用；但若与 ASM 共存（双向树），仍需 RP 处理 EXCLUDE 语义。
4. 混淆 `INCLUDE` 与 `EXCLUDE`——SSM 用 INCLUDE，EXCLUDE 是 ASM 的「排除少量源」语义。
5. 以为 SSM 能发现新源——接收者必须预知源地址，不适合「未知源广播」场景。

## 七、与开源书·权威来源对应

- RFC 4607（Holbrook & Cain 2006）：定义 SSM 模型与 `232.0.0.0/8` 范围，明确无需 RP。
- RFC 3376（Cain et al.）：IGMPv3，提供 `INCLUDE/EXCLUDE` 源过滤，是 SSM 的接入层基础。
- RFC 4610：SSM 主机行为与地址分配考量。
- RFC 4601 / RFC 7761：PIM-SSM 模式如何仅用 (S,G) 建树。
- Kurose & Ross《Computer Networking》ch4：SSM 与 ASM 对比。

## 八、面试题

1. SSM 为什么不需要 RP？
   要点：接收者已显式指定源 $S$，DR 直接发 (S,G) Join 沿 RPF 建源树，省去共享树与 RP 注册。
2. IGMPv3 相比 v2 最大改进？
   要点：支持源过滤（INCLUDE/EXCLUDE 指定源），支撑 SSM 只收期望源，杜绝无关源流量。
3. SSM 的代价是什么？
   要点：接收者必须预先知道源地址，无法「加入组后被动发现所有源」，适合已知源的场景（IPTV）。
4. SSM 状态为何更省？
   要点：无 (*,G) 与 RP 注册状态，仅维护 (S,G)，控制面负担显著低于 ASM。

## 九、演进与趋势

SSM 成为 IPTV、视频会议、金融行情推送的首选；与 PIM-SSM 配合几乎取代复杂 ASM 部署；IPv6 中 SSM 对应 `FF3x::/32`（含 scope 字段）；与 BIER 结合可进一步去树化、降低状态。在云原生环境，SSM 因无需 RP 而更易自动化部署。

## 十、小结

SSM 以「源特定 + IGMPv3 源过滤 + 232/8 地址」实现无 RP、安全的组播，简化了部署并提升抗干扰能力。理解其与 ASM 的取舍（须预知源地址 vs 免 RP/抗无关源），是现代组播网络选型的关键——对已知源的流媒体场景，SSM 是当前最优解。
