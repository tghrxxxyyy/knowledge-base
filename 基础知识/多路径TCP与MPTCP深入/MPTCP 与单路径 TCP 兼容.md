# MPTCP 与单路径 TCP 兼容

> 对应 RFC 8684 第 3 节兼容性设计与 xiaolincoder/hello-http 的降级说明。

## 一、背景与挑战
真实网络中大量中间盒会改写、丢弃未知 TCP 选项，且许多对端不支持 MPTCP。MPTCP 必须做到：支持时无缝多路径，不支持时完全等价于普通 TCP，且应用无感知。

## 二、核心原理
兼容性来自「TCP 选项协商 + 透明降级」。建连的 MP_CAPABLE 若被对端忽略或中间盒剥离，则握手退化为标准 TCP 三次握手，连接照常工作。已建立的 MPTCP 连接若某子流路径不通，数据自动经其余子流传输，应用不中断。选项编码也保证未知选项被中间盒安全忽略（遵循 TCP 选项规范的长度字段）。

## 三、形式化与数学基础
握手结果集合 {MPTCP, TCP}：若两端均回显 MP_CAPABLE 且密钥交换成功 → MPTCP；否则 → TCP（降级）。该决策在连接层完成，应用 socket 接口（connect/read/write）保持不变，语义等价。

## 四、代码实现
```c
if peer_synack_has(MP_CAPABLE) and verify_key():
    mode = MPTCP
else:
    mode = TCP          # 透明降级，应用无感
```

## 五、与其他技术对比
SCTP 因使用独立 IP 协议号（132）常被 NAT/防火墙阻断，部署困难；MPTCP 复用 TCP 端口与协议号，兼容性远好。QUIC 用 UDP 穿透，但需应用/库支持，与 MPTCP 的「对应用透明」定位不同。

## 六、常见误区
误区一：开了 MPTCP 就一定多路径——对端或中间盒不支持即降级。误区二：降级会失败——降级即标准 TCP，本就是常态。误区三：选项会被错误解析——TCP 选项长度字段保证未知选项被跳过。

## 七、与开源书/权威来源对应
RFC 8684 第 3 节明确「fallback to TCP」；xiaolincoder/hello-http 解释降级；Kurose & Ross 讨论协议演化兼容。

## 八、面试题
MPTCP 如何降级？为何对应用透明？中间盒剥离选项会怎样？与 SCTP 部署难度差异？

## 九、演进与趋势
随着主流 OS（Linux 5.6+，iOS/macOS）内置 MPTCP，兼容路径愈发普遍；但跨运营商、跨 NAT 场景的降级仍是现实常态，需正确 fallback 逻辑。

## 十、小结
MPTCP 通过选项协商与透明降级保证与单路径 TCP 完全兼容，是它能在实际异构网络中落地而非仅存于实验室的关键。
