# 大量TIME_WAIT的排查与调优

> 对应 xiaolincoder/hello-http 与 Linux 内核网络参数文档。

## 一、背景与挑战
线上服务偶发 `TIME_WAIT` 堆积导致新连接失败或端口耗尽。排查需区分是主动关闭方、连接模型问题还是内核参数不当，避免「头痛医头」地盲目调参。

## 二、核心原理
先用 `ss -tan | grep TIME-WAIT | wc -l` 统计数量与本地/远端地址，定位哪一端主动关闭。若本机为客户端且主动关闭，可启用 `tcp_tw_reuse`；若为监听服务，应优化为被动关闭或引连接池。同时检查 `tcp_max_tw_buckets` 限制，超过该值内核会直接销毁最老的 TIME_WAIT 而不进入队列。

## 三、形式化与数学基础
TIME_WAIT 套接字总数受桶上限约束：
$$ |TW| \le \text{net.ipv4.tcp_max_tw_buckets} $$
出向连接并发上限受端口范围 $R$ 与远端四元组数 $M$ 约束：
$$ C_{max} = R \times M $$
调优即在不破坏 2MSL 语义下最大化 $C_{max}$。

## 四、代码实现
排查与调优命令：
```bash
ss -tan state time-wait | head
sysctl -w net.ipv4.tcp_max_tw_buckets=262144
sysctl -w net.ipv4.tcp_tw_reuse=1
```
快速统计脚本：
```python
import subprocess
out = subprocess.check_output(['ss','-tan']).decode()
print('TIME_WAIT count:', sum(1 for l in out.splitlines() if 'TIME-WAIT' in l))
```

## 五、与其他技术对比
连接池与长连接从源头减少握手/挥手次数，优于事后调内核参数；服务网格常通过 sidecar 复用连接进一步降低 TIME_WAIT。

## 六、常见误区
误区一是把 `tcp_max_tw_buckets` 调得极大以为能「容纳」所有 TIME_WAIT，实际只是提高上限，治标不治本。误区二是忽视 `tcp_tw_recycle` 已移除，照搬旧文章会导致配置无效。

## 七、与开源书/权威来源对应
xiaolincoder/hello-http 给出端口耗尽排查链路；Linux `ip-sysctl.txt` 描述 `tcp_max_tw_buckets`、`tcp_tw_reuse` 语义。

## 八、面试题
问：如何判断 TIME_WAIT 由谁主动关闭导致？答：看本地地址是否为客户端临时端口（在 `ip_local_port_range` 内）且远端为固定服务端口，通常说明本机是主动关闭的客户端。

## 九、演进与趋势
云原生环境下短生命周期 Pod 频繁建连，推荐在客户端启用 `tcp_tw_reuse` 并配合连接池；内核侧不再提供激进回收开关，正确性优先。

## 十、小结
TIME_WAIT 排查先于调优：先定位主动关闭方与连接模型，再辅以 `tcp_tw_reuse`、扩大端口范围与连接池，避免依赖已废弃参数。
