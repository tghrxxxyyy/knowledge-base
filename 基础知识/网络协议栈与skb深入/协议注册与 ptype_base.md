# 协议注册与 ptype_base

> 对应 Linux 内核 `net/core/dev.c` 的 `dev_add_pack` 与 `ptype_base`，xiaolincoder/hello-http 协议分发说明，及 Kurose & Ross 多路复用（解复用）。

## 一、背景与挑战

链路层（如以太网）收到帧后，需根据 **EtherType**（以太网类型）把帧分发给正确的网络层协议处理例程——IPv4（0x0800）、IPv6（0x86DD）、ARP（0x0806）等。内核不能把协议处理逻辑写死，否则新增协议就要改核心代码。为此，内核用 **`ptype_base` 哈希表**管理已注册的协议处理例程，实现「解复用（demux）」的解耦与可扩展。挑战在于：如何高效匹配、如何支持「全收」（抓包），以及多命名空间下的视图隔离。

## 二、核心原理

每个协议通过 `dev_add_pack` 注册一个 `packet_type` 结构，关键字段：

- `type`：协议类型，如 `ETH_P_IP = 0x0800`（网络字节序）。
- `func`：接收处理函数，如 `ip_rcv`。
- `dev`：绑定的网络设备（NULL 表示全部）。
- `list`：挂入哈希表的链表节点。

注册时，内核按 `type` 取模把 `packet_type` 挂入 `ptype_base` 哈希表的对应桶。收包时 `netif_receive_skb` 遍历匹配项：先匹配具体 `type`，再匹配 `ETH_P_ALL`（全收，用于抓包），逐一把 skb 交给对应 `func` 上送。

实现上，`dev_remove_pack` 负责反注册，模块卸载时必须调用，否则残留的 `packet_type` 会在收包时被调用到已释放的函数，导致内核崩溃。对于同一 `type` 注册多个处理（如主协议处理 + 某监控钩子），`ptype_base` 链表会顺序遍历，因此注册顺序影响处理先后。抓包类 `ETH_P_ALL` 项挂在独立的 `ptype_all` 链表，与按类型哈希的 `ptype_base` 分开管理，避免在高频路径上被全收项拖慢。多队列与 per-CPU 收包进一步优化分发路径，但 `ptype_base` 的解复用中枢地位不变。

## 三、形式化与数学基础

`ptype_base` 为大小 `PTYPE_HASH_SIZE`（历史为 16）的哈希表，索引：

$$
i = type\ \&\ (PTYPE\_HASH\_SIZE - 1)
$$

冲突以链表串接；匹配条件为：

$$
ptype\rightarrow type == skb\rightarrow protocol \quad \text{或} \quad ptype\rightarrow type == ETH\_P\_ALL
$$

分发时间复杂度约为 $O(1 + L_{chain})$，$L_{chain}$ 为冲突链长度。多协议时，同一 skb 可被多个 `packet_type` 处理（如 IP 协议处理 + `ETH_P_ALL` 抓包），故是「一对多分发」而非「一对一路由」。

## 四、代码实现

```c
/* 注册 IPv4 处理例程（内核 net/core/dev.c 示意） */
static struct packet_type ip_packet_type = {
    .type = cpu_to_be16(ETH_P_IP),
    .func = ip_rcv,
    .dev  = NULL,          /* 所有设备 */
};

/* 模块初始化时注册 */
dev_add_pack(&ip_packet_type);

/* 全收（抓包）示例 */
static struct packet_type capture_ptype = {
    .type = cpu_to_be16(ETH_P_ALL),
    .func = capture_rx,
};
dev_add_pack(&capture_ptype);
```

## 五、与其他技术对比

- **BSD `ether_input` 分流表**：BSD 用协议分流表把 ethertype 映射到 `ip_input` 等，思想与 ptype 同源。
- **`ETH_P_ALL` vs AF_PACKET**：用户态抓包通过 `ETH_P_ALL` 接收全部帧，等价于内核 ptype 全收项。
- **eBPF tc/XDP**：在 ptype 分发之前更早拦截与处理包，逐渐承担部分传统协议分发与过滤。
- **`ptype_all` 链表**：`ETH_P_ALL` 类全收项单独挂在 `ptype_all`，与按类型哈希的 `ptype_base` 区分。

## 六、常见误区

- **误区一：EtherType 决定一切**——VLAN / 嵌套封装会二次分发，需逐层解复用。
- **误区二：ETH_P_ALL 只抓 IP**——它抓取所有类型帧（含 ARP、IPv6）。
- **误区三：注册全局唯一**——部分协议视图与 netns 相关，抓包范围受命名空间约束。
- **误区四：type 是主机序**——EtherType 在网络包里为网络字节序，比较前需 `cpu_to_be16` 或 `ntohs`。

## 七、与开源书·权威来源对应

- Linux 内核 `net/core/dev.c` 的 `dev_add_pack` / `__netif_receive_skb_core` / `ptype_base`。
- xiaolincoder/hello-http 说明帧如何上送 IP 层。
- Kurose & Ross《Computer Networking》多路复用（解复用）概念。
- 《深入理解 Linux 网络》协议注册与收包分发章节。

## 八、面试题

- ptype_base 的作用？为何用哈希表？
- ETH_P_ALL 的用途？抓包如何工作？
- 新协议如何注册到内核？netif_receive_skb 做什么？
- VLAN / 嵌套封装为何需要二次分发？

随着 eBPF 成熟，`tc` 与 `XDP` 程序可在 `ptype_base` 分发之前更早拦截、过滤甚至重写包，许多原本需要内核模块注册协议处理的场景，如今改用 eBPF 即可动态加载，无需重新编译内核。但这并不意味着 `ptype_base` 被取代——它仍是内核原生协议（IP、IPv6、ARP）解复用的中枢，eBPF 更多承担「旁路与扩展」。理解二者分工，有助于在「改内核 vs 写 eBPF」之间做正确取舍。

## 九、演进与趋势

eBPF 的 tc / XDP 程序可在 ptype 分发之前更早拦截与处理包，逐渐承担部分传统协议分发与过滤职责；多队列与 per-CPU 收包进一步优化分发路径。具体实现以内核版本为准。

## 十、小结

`ptype_base` 哈希表是链路层到网络层的解复用中枢，`packet_type` 注册机制让协议处理可插拔、可扩展——新增协议无需改动核心，仅需 `dev_add_pack` 注册即可被分发。
