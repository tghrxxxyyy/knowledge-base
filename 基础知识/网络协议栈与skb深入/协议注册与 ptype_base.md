# 协议注册与 ptype_base

> 对应 Linux 内核协议注册机制与 xiaolincoder/hello-http 对协议分发（packet_type）的介绍。

## 一、背景与挑战
链路层收到帧后，需根据以太网类型（EtherType）把帧分发给正确的网络层协议（IPv4、IPv6、ARP 等）。内核用 ptype_base 哈希表管理已注册的协议处理例程，实现解耦与可扩展。

## 二、核心原理
每个协议通过 dev_add_pack 注册一个 packet_type 结构，含 type（如 ETH_P_IP=0x0800）与 func（如 ip_rcv）。内核把 packet_type 挂入 ptype_base 哈希表（按 type 取模）。收包时 netif_receive_skb 遍历匹配项，调用对应接收函数把 skb 上送。

## 三、形式化与数学基础
ptype_base 为大小为 16 的哈希表（PTYPE_HASH_SIZE），索引 i = type & (16-1)。冲突以链表串接；匹配条件为 ptype->type == skb->protocol（或 type 为 ETH_P_ALL 全收，用于抓包）。分发复杂度 O(1 + 冲突链长)。

## 四、代码实现
```c
struct packet_type ip_packet_type = {
    .type = cpu_to_be16(ETH_P_IP),
    .func = ip_rcv,
};
dev_add_pack(&ip_packet_type);   /* 注册 IPv4 处理 */
```

## 五、与其他技术对比
BSD 用 ifnet/ether_input 的协议分流表（如 ip_input 注册到 ethertype）；用户态抓包（AF_PACKET）通过 ETH_P_ALL 接收全部帧，等价于内核 ptype 的全收项。

## 六、常见误区
误区一：EtherType 决定一切——VLAN/CAPTIVE 等会二次分发。误区二：ETH_P_ALL 只抓 IP——它抓所有类型帧。误区三：注册是全局唯一——每个 netns 有独立 ptype 视图（部分）。

## 七、与开源书/权威来源对应
内核 net/core/dev.c 的 dev_add_pack/ptype_base；xiaolincoder/hello-http 说明帧如何上送 IP 层；Kurose & Ross 描述多路复用（解复用）概念。

## 八、面试题
ptype_base 作用？ETH_P_ALL 用途？新协议如何注册？netif_receive_skb 做什么？

## 九、演进与趋势
eBPF 的 tc/XDP 程序可在 ptype 分发之前更早拦截与处理包，逐渐承担部分传统协议分发与过滤职责。

## 十、小结
ptype_base 哈希表是链路层到网络层的解复用中枢，packet_type 注册机制让协议处理可插拔、可扩展。
