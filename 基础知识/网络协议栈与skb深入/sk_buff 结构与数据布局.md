# sk_buff 结构与数据布局

> 对应《Linux 内核网络栈》与 xiaolincoder/hello-http 对 sk_buff 的介绍，以及内核源码 include/linux/skbuff.h。

## 一、背景与挑战
网络子系统在协议各层间传递数据包，若每层都拷贝数据将极其低效。Linux 用 struct sk_buff（简称 skb）统一表示数据包，并通过指针偏移在不同协议头间切换，避免拷贝。

## 二、核心原理
skb 包含数据缓冲区（head/data/tail/truck），以及指向各协议头的指针（mac_header、network_header、transport_header）。head 到 data 之间是 headroom，data 到 tail 是有效载荷，tail 到 end 是 tailroom。各层通过 skb_push（头部前移）/skb_pull（跳过已处理头）调整 data 指针来「添加/剥离」协议头，零拷贝。

## 三、形式化与数学基础
令缓冲区起止为 [head, end]，有效数据区间 [data, tail]。skb_push(n) 使 data := data - n（需 data >= head）；skb_pull(n) 使 data := data + n（需 data+n <= tail）。协议头遍历即依次移动 transport/network/mac 指针。

## 四、代码实现
```c
/* 进入 IP 层：剥离以太网头 */
skb_pull(skb, ETH_HLEN);
skb->network_header = skb->data;
/* 发送时添加 IP 头 */
skb_push(skb, sizeof(struct iphdr));
ip_hdr = skb->network_header = skb->data;
```

## 五、与其他技术对比
BSD 的 mbuf 采用链表式聚簇缓冲，Linux skb 采用单一连续缓冲 + 指针区间，二者都致力于减少拷贝。DPDK 用户态 mbuf 进一步绕过内核 skb 以追求极致性能。

## 六、常见误区
误区一：每层都拷贝数据——skb 通过指针移动避免。误区二：headroom 无用——供下层添加头预留空间。误区三：skb 等于一个包——可被分片、克隆、共享，逻辑上可代表多状态。

## 七、与开源书/权威来源对应
内核 include/linux/skbuff.h 定义 skb；xiaolincoder/hello-http 图示 skb 布局；Kurose & Ross 描述协议分层封装思想。

## 八、面试题
skb_push 与 skb_pull 区别？headroom/tailroom 用途？为何 skb 减少拷贝？network_header 指针如何设置？

## 九、演进与趋势
内核引入 skb 的「 frag」与「 frag_list」支持分散/聚集 I/O（skb_shinfo），配合 GSO/GRO 实现大包聚合与分片卸载。

## 十、小结
sk_buff 用连续缓冲加多层指针区间表达数据包，push/pull 实现零拷贝的协议头增删，是内核网络栈高效流转的核心。
