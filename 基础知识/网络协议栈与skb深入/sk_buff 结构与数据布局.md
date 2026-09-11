# sk_buff 结构与数据布局

> 对应 Linux 内核 `include/linux/skbuff.h`、xiaolincoder/hello-http 的 sk_buff 图示，及 Kurose & Ross 协议分层封装思想。

## 一、背景与挑战

网络子系统在协议各层（链路 / 网络 / 传输 / 应用）间传递数据包，若每一层都拷贝数据将极其低效（一次收包可能涉及多次内存复制）。Linux 用 `struct sk_buff`（简称 **skb**）统一表示数据包，并通过**指针偏移**在不同协议头之间切换，避免逐层拷贝。挑战在于：如何用一套结构同时表达「正在被各层处理、可克隆共享、可分片聚合」的复杂生命周期。

## 二、核心原理

skb 围绕一块**连续数据缓冲区**组织，关键字段：

- 缓冲区边界：`head`（起点）、`end`（终点）。
- 有效数据区间：`data`（当前有效载荷起点）、`tail`（终点）。
- 预留空间：`head` 到 `data` 之间是 **headroom**，`tail` 到 `end` 之间是 **tailroom**。
- 协议头指针：`mac_header`、`network_header`、`transport_header` 分别指向各层头起点。

各层通过两个核心操作在零拷贝下增删协议头：

- **`skb_push(n)`**：把 `data` 前移 n 字节（发送时「添加」低层头），需 `data >= head`。
- **`skb_pull(n)`**：把 `data` 后移 n 字节（接收时「剥离」已处理头），需 `data + n <= tail`。

这样「添加 IP 头」「剥以太网头」只是移动指针，不复制数据。

## 三、形式化与数学基础

令缓冲区区间 $[head, end]$，有效数据区间 $[data, tail]$。操作约束：

$$
skb\_push(n):\ data := data - n,\quad \text{需 } data - n \ge head
$$
$$
skb\_pull(n):\ data := data + n,\quad \text{需 } data + n \le tail
$$

协议头遍历即依次移动 `transport / network / mac` 指针。有效载荷长度：

$$
L = tail - data
$$

headroom 与 tailroom 提供「下层添加头 / 上层追加数据」的预留空间，避免重新分配。当预留不足时，`pskb_expand_head` 会重新分配更大缓冲区（此时才有一次拷贝）。

## 四、代码实现

```c
/* 接收：进入 IP 层，剥离以太网头 */
skb_pull(skb, ETH_HLEN);
skb->network_header = skb->data;        /* 指向 IP 头起点 */

/* 发送：添加 IP 头（先 push 预留空间，再填充） */
skb_push(skb, sizeof(struct iphdr));
skb->network_header = skb->data;
struct iphdr *iph = (struct iphdr *)skb->network_header;
iph->version = 4;
iph->ihl = 5;
/* ... 填充源/目的 IP、校验和 ... */
```

## 五、与其他技术对比

- **BSD mbuf**：采用「mbuf + cluster」链表式聚簇缓冲，同样致力于减少拷贝，但表达为链表而非单一连续区。
- **Linux skb**：单一连续缓冲 + 指针区间，push/pull 表达头增删。
- **DPDK mbuf**：用户态绕过内核 skb，追求极致性能，但脱离内核协议栈生态。
- **scatter-gather（frag）**：skb 用 `skb_shinfo()->frags` 支持分页数据，避免大包连续分配。

## 六、常见误区

- **误区一：每层都拷贝数据**——skb 通过指针移动避免，仅 headroom/tailroom 不足时才拷贝。
- **误区二：headroom 无用**——正是为下层添加协议头预留，避免重分配。
- **误区三：skb 等于一个包**——它可被分片、克隆、共享，逻辑上代表多状态。
- **误区四：data 指针固定**——它在协议栈逐层流动时持续移动。

## 七、与开源书·权威来源对应

- Linux 内核 `include/linux/skbuff.h` 定义 skb 结构与各操作。
- xiaolincoder/hello-http 图示 skb 布局与 push/pull。
- 《Linux 内核网络》（或《深入理解 Linux 网络》）skb 章节。
- Kurose & Ross《Computer Networking》协议分层封装思想。

## 八、面试题

- skb_push 与 skb_pull 区别？各自使用场景？
- headroom / tailroom 的用途？为何需要预留？
- 为何 skb 能减少拷贝？network_header 指针如何设置？
- 对比 skb 与 BSD mbuf 的设计差异？

## 九、演进与趋势

内核引入 `frag` 与 `frag_list` 支持分散 / 聚集 I/O（`skb_shinfo`），配合 GSO/GRO 实现大包聚合与分片卸载；XDP 进一步在驱动层用「原地修改」模式操作 skb 类缓冲，减少分配。具体结构随内核版本演进，以官方源码为准。

调试 skb 相关问题时，可借助 `skb->data` / `head` / `tail` 指针判断数据区间是否越界，用 `skb_headroom` / `skb_tailroom` 宏确认预留空间是否充足；当出现「头添加失败」或「数据被截断」，多半是 headroom / tailroom 估算不足、未提前 `pskb_expand_head`。理解这套区间模型，也是在阅读 tcp_sendmsg、ip_finish_output 等核心路径时不被指针运算绕晕的前提。

## 十、小结

sk_buff 用连续缓冲加多层指针区间表达数据包，push/pull 实现零拷贝的协议头增删，是内核网络栈高效流转的核心抽象。
