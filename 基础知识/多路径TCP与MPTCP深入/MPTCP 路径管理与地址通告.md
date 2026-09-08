# MPTCP 路径管理与地址通告

> 对应 RFC 8684 第 3.4 节 ADD_ADDR/REMOVE_ADDR 与 xiaolincoder/hello-http 的路径管理说明。

## 一、背景与挑战
MPTCP 要在多条路径上建立子流，就必须让对端知道「我还有哪些 IP 地址/端口可用」。地址通告机制让连接的两端动态公布与撤销可达地址，驱动子流的建立与回收。

## 二、核心原理
通过 ADD_ADDR 选项，一端把自己的新 IP（及可选端口）告知对端；对端据此发起 MP_JOIN 建立新子流。REMOVE_ADDR 用于撤销不再可达的地址。地址带「地址 ID」便于引用，且可含 IPv4/IPv6。为避免暴露过多信息，通告可只给 ID 而由对端经已有子流探测。

## 三、形式化与数学基础
每条地址有唯一 address_id（1 字节），子流由 (local_addr, remote_addr, address_id) 标识。路径管理状态机维护可用地址集 A 与活跃子流集 S：收到 ADD_ADDR(a) 则 A ← A ∪ {a} 并触发建流；REMOVE_ADDR(a) 则 S 中相关子流经 FIN 后移除。

## 四、代码实现
```c
/* 通告新地址（概览） */
struct add_addr {
    .subtype = MPTCP_ADD_ADDR,
    .address_id = 1,
    .addr = new_ip,
    .port = optional,
};
/* 对端收到后发起 MP_JOIN 到 new_ip */
```

## 五、与其他技术对比
SCTP 的 ASCONF 也用于动态增删 IP；MPTCP 的 ADD_ADDR 更轻量且可延迟暴露端口（配合 MP_JOIN 探测）。应用层多连接（如并行 HTTP/2 连接）需业务参与，而 MPTCP 对应用透明。

## 六、常见误区
误区一：通告地址即建流——ADD_ADDR 只是信息，建流还需对端主动 MP_JOIN。误区二：地址暴露无代价——可能泄露多宿主拓扑，故可只通告 ID。误区三：移除地址立即断——需等相关子流优雅关闭。

## 七、与开源书/权威来源对应
RFC 8684 第 3.4.1/3.4.2 节 ADD_ADDR/REMOVE_ADDR；xiaolincoder/hello-http 说明路径切换；Kurose & Ross 提及地址可达性。

## 八、面试题
ADD_ADDR 作用？为何需要 address_id？为何可能只通告 ID？REMOVE_ADDR 流程？

## 九、演进与趋势
移动操作系统用 MPTCP 路径管理实现 Wi-Fi/蜂窝无缝切换；eBPF 策略可自定义「何时通告哪个地址」，优化功耗与资费。

## 十、小结
地址通告（ADD_ADDR/REMOVE_ADDR）让 MPTCP 动态发现与回收路径，是其实现多路径灵活调度与无缝切换的管理基础。
