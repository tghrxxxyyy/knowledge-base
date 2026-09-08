# MPTCP 连接建立与 MP_CAPABLE

> 对应 RFC 8684（MPTCP v1，取代 RFC 6824）第 3 节，以及 xiaolincoder/hello-http 对 MPTCP 的介绍。

## 一、背景与挑战
单路径 TCP 绑定一条路由，一旦路径故障或拥塞即整条连接受损。MPTCP 在保留对标准 TCP 应用接口不变的前提下，允许一个逻辑连接横跨多条路径（如 Wi-Fi 与蜂窝同时），聚合带宽并提升韧性。

## 二、核心原理
MPTCP 在 TCP 选项空间中以「MPTCP 子选项」协商。建连时 SYN 携带 MP_CAPABLE 表明支持 MPTCP，并交换密钥（key）用于后续子流的安全加入。若对端不支持，则透明降级为普通 TCP。成功协商后，初始子流即为主子流，承载数据并协商令牌（token）。

## 三、形式化与数学基础
握手交换密钥 A（发起方）、B（对端）。双方推导 token = HMAC/哈希(key) 用于标识连接，以及随机数 HMAC 校验子流加入。MP_CAPABLE 选项含版本、标志位与 64 位密钥，使中间盒不可见的降级逻辑保持兼容。

## 四、代码实现
```c
/* 发起方 SYN 选项（概览） */
struct mptcp_option {
    .subtype = MPTCP_MP_CAPABLE,
    .version = 1,
    .sender_key = random64(),
};
/* 对端在 SYN/ACK 回显 receiver_key */
```

## 五、与其他技术对比
SCTP 也支持多归属（multi-homing）但需端点原生支持且常受 NAT 阻碍；MPTCP 设计目标是对应用与网络透明（跑在 TCP 上）。QUIC 的多路径扩展仍在标准化中，MPTCP 是目前最成熟的单连接多路径传输。

## 六、常见误区
误区一：MPTCP 需要应用改代码——对标准 socket API 透明。误区二：任意两个 IP 都能组 MPTCP——需两端均支持且成功 MP_JOIN。误区三：MP_CAPABLE 一定成功——中间盒可能剥离选项导致降级普通 TCP。

## 七、与开源书/权威来源对应
RFC 8684 第 3.1 节定义 MP_CAPABLE；xiaolincoder/hello-http 图示建连；Kurose & Ross 在 TCP 章提及扩展。

## 八、面试题
MPTCP 如何向后兼容？MP_CAPABLE 交换什么？降级普通 TCP 何时发生？为何对应用透明？

## 九、演进与趋势
MPTCP v1（RFC 8684）简化并增强了 v0；Linux 内核自 5.x 起主线支持 MPTCP，并在移动场景（如苹果设备）广泛用于 Wi-Fi/蜂窝切换。

## 十、小结
MP_CAPABLE 是 MPTCP 的建连握手，通过 TCP 选项协商能力并交换密钥，失败时透明降级为 TCP，是其广泛部署的基础。
