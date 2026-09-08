# TCP_NODELAY 与禁用 Nagle

> 对应 Linux socket(7)/tcp(7) 的 TCP_NODELAY 选项与 xiaolincoder/hello-http 关于禁用 Nagle 的说明。

## 一、背景与挑战
Nagle 算法虽节省带宽，却会让「先写一小段、等 ACK、再写」的交互式应用出现人为延迟。对延迟敏感的协议（游戏、RPC、实时控制）需要关闭 Nagle，让每个写立即发出，即设置 TCP_NODELAY。

## 二、核心原理
TCP_NODELAY 为 1 时，内核不再执行 Nagle 的「有未确认小段则暂缓」逻辑，每次 send 只要缓冲有空间就尽快发出（仍受窗口与拥塞控制约束）。代价是可能产生更多小包。它与 TCP_NOPUSH/TCP_CORK（Linux 为 TCP_CORK）相对——后者主动延缓发送以攒大包，与 NODELAY 互斥。

## 三、形式化与数学基础
开启 NODELAY 后，发送判定简化为：只要 (flight < min(cwnd, rwnd)) 且缓冲有数据即发，不再等待 outstanding==0。单字节写的发包延迟从「约 1 个 ACK RTT」降为「约 1 个发送时延」，但小包率上升，链路有效利用率下降。

## 四、代码实现
```c
int on = 1;
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &on, sizeof on);
/* 此后 send 小数据立即发出，不受 Nagle 暂缓 */
```

## 五、与其他技术对比
TCP_CORK 与 NODELAY 相反：CORK 把多次写「塞住」直到超时或取消 CORK，攒成单个大段（适合 HTTP 响应头+体合并）。应用应二选一：交互低延迟用 NODELAY，批量高吞吐用 CORK/默认 Nagle。

## 六、常见误区
误区一：NODELAY 保证立即到达——只保证「尽快发出」，网络传输延迟仍受路由与 RTT 影响。误区二：开了 NODELAY 永远更快——小包过多会降低整体吞吐。误区三：NODELAY 与 Nagle 可同时——二者语义相反，设 NODELAY 即关闭 Nagle。

## 七、与开源书/权威来源对应
man tcp(7) 的 TCP_NODELAY/TCP_CORK；xiaolincoder/hello-http 对比二者；Kurose & Ross 讨论时延与效率权衡。

## 八、面试题
TCP_NODELAY 做什么？与 TCP_CORK 区别？何时该开？为何开了仍可能慢？

## 九、演进与趋势
许多现代框架（如 gRPC、Redis 客户端）默认启用 TCP_NODELAY 以保证交互及时；同时用应用层批量合并（pipeline）来兼顾小包问题，而非依赖 Nagle。

## 十、小结
TCP_NODELAY 关闭 Nagle 以获得最低交互延迟，适合延迟敏感应用，但需配合应用层批量以降低小包率，是延迟与带宽的经典权衡点。
