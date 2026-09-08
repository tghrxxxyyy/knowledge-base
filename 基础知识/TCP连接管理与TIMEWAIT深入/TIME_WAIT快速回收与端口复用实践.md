# TIME_WAIT快速回收与端口复用实践

> 对应 xiaolincoder/hello-http 与 Linux 内核 `tcp_tw` 实现文档。

## 一、背景与挑战
在频繁主动关闭的高并发服务中，单机可能出现数万 TIME_WAIT 套接字，耗尽可用本地端口范围（如 32768–60999），导致新连接报 `Cannot assign requested address`。如何在保证协议正确性的前提下缓解端口耗尽，是工程实践中的常见课题。

## 二、核心原理
根本手段是扩大可分配端口与加快回收。端口复用依靠 `SO_REUSEADDR`/`SO_REUSEPORT` 让监听套接字或多个进程共享同一端口；出向连接的 TIME_WAIT 复用由 `tcp_tw_reuse` 在启用时间戳时完成，内核通过比较时间戳判定新报文更新从而安全复用。

## 三、形式化与数学基础
可用本地端口数约为：
$$ N_{port} = (\text{net.ipv4.ip_local_port_range 上限} - \text{下限} + 1) \times (\text{目标 IP 数}) \times (\text{目标端口数}) $$
在单一远端四元组下，能并发的连接数受端口数约束，故扩大 `ip_local_port_range` 与多目标分摊是提升上限的直接方式。

## 四、代码实现
内核参数调整示例：
```bash
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
```
绑定复用端口的 Python 示意：
```python
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
s.bind(('0.0.0.0', 8080))
```

## 五、与其他技术对比
相较于曾经存在的 `tcp_tw_recycle`（已移除），`tcp_tw_reuse` 只作用于出向连接且依赖时间戳，对 NAT 对端更友好。与应用层长连接、连接池相比，内核级复用无需修改业务代码。

## 六、常见误区
误区一是启用 `tcp_tw_recycle` 加速回收，该选项已在 Linux 4.12 移除且历史上导致 NAT 后客户端随机复位。误区二是以为 `SO_REUSEADDR` 能解决出向客户端端口耗尽，它主要服务于监听套接字。

## 七、与开源书/权威来源对应
xiaolincoder/hello-http 详解了 `tcp_tw_reuse` 与端口范围调优；Linux `Documentation/networking/ip-sysctl.txt` 描述各 `tcp_tw` 参数语义。

## 八、面试题
问：服务端出现大量 TIME_WAIT 应优先调哪个参数？答：先判断谁主动关闭；若为客户端侧可开 `tcp_tw_reuse`，同时扩大 `ip_local_port_range`，并考虑使用连接池减少短连接。

## 九、演进与趋势
随着 `tcp_tw_recycle` 退役，社区更强调正确设计连接生命周期：服务端保持被动关闭、客户端使用连接池、必要时以 `tcp_tw_reuse` 兜底。

## 十、小结
缓解 TIME_WAIT 压力应以扩大端口范围、复用端口、使用连接池为主，谨慎使用 `tcp_tw_reuse`，坚决避免已废弃的 `tcp_tw_recycle`。
