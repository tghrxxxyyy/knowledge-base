# skb 克隆与共享数据

> 对应 Linux 内核 skbuff 的克隆/共享语义与 xiaolincoder/hello-http 关于 skb 复用的说明。

## 一、背景与挑战
同一数据包可能需要被多个消费者处理（如多播、抓包、重定向），逐份拷贝代价高。skb 提供克隆（clone）与共享（share）机制，让多个 skb 结构体引用同一数据区，仅在写入时才真正拷贝（写时复制）。

## 二、核心原理
skb_clone 创建一个新 skb 头，但共享同一数据缓冲区（通过引用计数 dataref）。此时任一持有者只读安全；当某方要修改数据时调用 skb_copy 或 pskb_expand_head 做写时复制，分离出独立缓冲。引用计数归零才释放数据区。

## 三、形式化与数学基础
令数据区引用计数 r。clone 使 r -> r+1；释放使 r -> r-1；r 降至 0 时释放。写操作代价：若 r>1 则先拷贝（O(L)），再写；若 r==1 直接写 O(修改量)。克隆头本身成本 O(1)，远低于全量拷贝 O(L)。

## 四、代码实现
```c
struct sk_buff *c = skb_clone(skb, GFP_ATOMIC);
if (skb_shared(skb)) {            /* 他人也引用 */
    skb = skb_copy(skb, GFP_ATOMIC);  /* 写时复制 */
}
skb_put(skb, 4);  /* 修改需独立缓冲 */
```

## 五、与其他技术对比
BSD mbuf 的「mbuf + cluster」也用引用计数共享簇；用户态零拷贝（如 sendfile、splice）思想相近——避免在内核与用户间拷贝。DPDK mbuf 通过 refcnt 实现类似克隆。

## 六、常见误区
误区一：克隆后改一处全变——未做写时复制确实会，故修改前必须确保独占。误区二：克隆等于拷贝——仅头复制、数据共享。误区三：引用计数不会泄漏——任一处未 decref 都会泄漏。

## 七、与开源书/权威来源对应
内核 skbuff.c 的 skb_clone/skb_copy；xiaolincoder/hello-http 说明 skb 复用；《Linux 内核设计与实现》讲引用计数。

## 八、面试题
skb_clone 与 skb_copy 区别？写时复制何时触发？引用计数如何防泄漏？多播为何用克隆？

## 九、演进与趋势
skb 的 frags（分页数据）使零拷贝收发更精细；配合 XDP 的「原地修改」模式，克隆语义在 eBPF 程序中仍需谨慎处理。

## 十、小结
skb 克隆以共享数据 + 引用计数 + 写时复制实现高效多消费者，是报文多路处理（抓包、多播）零拷贝的基础。
