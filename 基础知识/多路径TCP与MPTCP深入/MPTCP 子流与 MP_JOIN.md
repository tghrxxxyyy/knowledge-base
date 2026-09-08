# MPTCP 子流与 MP_JOIN

> 对应 RFC 8684 第 3.2 节 MP_JOIN 子选项与 xiaolincoder/hello-http 的多路径说明。

## 一、背景与挑战
MPTCP 逻辑连接需要动态加入新网络路径（如手机从 Wi-Fi 切到蜂窝时新增子流）。MP_JOIN 负责在已有连接上把一条新 TCP 子流安全地关联到原 MPTCP 连接。

## 二、核心原理
新子流以普通 TCP 三次握手建立，SYN 携带 MP_JOIN 子选项，含 token（标识所属 MPTCP 连接）与随机数。对端用建连时交换的密钥校验该子流确属该连接，完成密钥材料的 HMAC 验证后子流即被接纳，开始承载数据映射。子流可随时增删，映射层把子流字节拼回统一数据序列。

## 三、形式化与数学基础
子流加入需满足：token == HMAC(key) 且与本地连接匹配；随机数与 HMAC 证明发起方掌握原密钥（防伪造加入）。数据映射以 Data Sequence Number（DSN）统一排序，使子流乱序/丢包在映射层重组。

## 四、代码实现
```c
/* 新子流 SYN 携带 */
struct mp_join {
    .subtype = MPTCP_MP_JOIN,
    .token   = conn_token,     /* 来自 MP_CAPABLE */
    .random  = rand32(),
};
/* 对端校验 HMAC(key, random) 后接受 */
```

## 五、与其他技术对比
SCTP 的 multi-homing 用多 IP 关联同一关联，但不在「子流」粒度独立建连；MPTCP 的子流是独立 TCP 连接，各自有独立拥塞控制与 ACK，更适配异构路径。

## 六、常见误区
误区一：子流就是多线程——子流是独立 TCP 连接但归属同一 MPTCP 连接。误区二：加入无需认证——MP_JOIN 用密钥 HMAC 防冒名。误区三：子流失效整连接断——其他子流仍可维持，韧性来源。

## 七、与开源书/权威来源对应
RFC 8684 第 3.2 节 MP_JOIN；xiaolincoder/hello-http 图示子流加入；Kleppmann《DDIA》讨论冗余路径。

## 八、面试题
MP_JOIN 如何关联原连接？子流失效会怎样？token 从何来？为何需要 HMAC 校验？

## 九、演进与趋势
Linux MPTCP 支持通过用户态配置或 eBPF 控制子流策略（如「优先 Wi-Fi」），与应用层多连接相比对业务完全透明。

## 十、小结
MP_JOIN 以认证方式把新 TCP 子流安全挂入既有 MPTCP 连接，实现路径的动态增删与透明聚合，是 MPTCP 多路径能力的体现。
