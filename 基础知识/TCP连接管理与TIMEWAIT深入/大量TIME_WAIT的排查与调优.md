# 大量TIME_WAIT的排查与调优

> 对应 Stevens《TCP/IP Illustrated》卷一第 18 章、Linux 内核 `Documentation/networking/ip-sysctl.txt`、图解网络（xiaolincoder/hello-http）。

## 一、背景与挑战
线上服务偶发 TIME_WAIT 堆积导致新连接失败或本地端口耗尽，典型报错为「Cannot assign requested address」。排查的核心是先定位「谁在主动关闭」与「连接模型是否合理」，再决定调参，避免「头痛医头」地盲目调内核参数。

若服务端是主动关闭方，调 `tcp_tw_reuse` 往往无效，因为该参数只作用于出向连接；若客户端是主动关闭方，又需确认能否改用连接池。许多事故的根因其实是应用层短连接滥用，而非内核参数不当。

排查前必须先建立「基线」：正常情况下该机 TIME_WAIT 数量的量级是多少、随时间如何波动、哪个后端目的端口贡献最多。没有基线的「数万 TIME_WAIT」可能完全正常——高 QPS 的短连接客户端本来就会长期维持大量 TIME_WAIT，这是稳态而非故障。

另一类容易混淆的指标是 SYN_RECV 与 CLOSE_WAIT：前者指向握手侧问题（队列溢出或 SYN 洪泛），后者指向应用未 close。只有 TIME_WAIT 与「端口耗尽」同时出现，才说明确实需要处理。

## 二、核心原理
先用 `ss -tan` 统计 TIME_WAIT 数量与本地/远端地址，定位哪一端主动关闭：本地地址落在 `ip_local_port_range` 临时端口区间且远端为固定服务端口，通常说明本机是主动关闭的客户端。若本机为客户端且主动关闭、连接对象少，可启用 `tcp_tw_reuse`；若为监听服务应优化为被动关闭或引入连接池。

同时检查 `tcp_max_tw_buckets` 上限，超过该值内核会直接销毁最老的 TIME_WAIT 而不入队，表现为计数突然不再增长但连接仍可能被拒。这一上限是「安全阀」而非「容量目标」，调大它只是延后问题。

判定「端口是否真的耗尽」要看两个量：一是处于 TIME_WAIT 的本地端口占 `ip_local_port_range` 的比例，二是近端时间内 `connect` 失败率。仅看 TIME_WAIT 绝对数量会误判。若比例很高（例如超过 70%）且目标后端数量少，则端口耗尽风险确实存在。

还需注意「多后端分摊」效应：同样的 TIME_WAIT 数量，若目标后端有 100 个不同 IP:Port，可用四元组数是端口数 × 100，压力小得多；若只连一个后端，则压力集中。因此「按目的端口聚合统计」比「看总数」更有诊断价值。

## 三、形式化与数学基础
TIME_WAIT 套接字总数受桶上限约束：

$$ |TW| \le \text{net.ipv4.tcp\_max\_tw\_buckets} $$

单进程/单机的出向并发上限受可用端口范围 $R$ 与远端四元组数 $M$ 约束：

$$ C_{max} = R \times M $$

其中 $R$ 为 `ip_local_port_range` 的端口数，$M$ 为（目标 IP 数 × 目标端口数）。调优的目标是在不破坏 2MSL 语义下最大化 $C_{max}$，而非简单增大桶或缩短超时。

进一步地，考虑连接建立速率 $Q$（条/秒）与 TIME_WAIT 占用时长 $T_{tw}$（Linux 约 60 秒），则稳态 TIME_WAIT 数量近似：

$$ |TW| \approx Q \cdot T_{tw} $$

这个式子给出两个结论：一是 TIME_WAIT 数量与连接速率线性相关，因此「突然翻倍」往往意味着 QPS 变化或上游重试风暴；二是若 $Q \cdot T_{tw} > R \cdot M$，则必然出现端口耗尽，此时唯一根治办法是降低 $Q$（连接池）或提高 $R \cdot M$（扩端口、多后端）。

## 四、代码实现
排查与调优命令示例：

```bash
ss -tan state time-wait | head          # 观察四元组
ss -tan state time-wait | awk '{print $4}' | cut -d: -f2 | sort | uniq -c | sort -rn | head
sysctl -w net.ipv4.tcp_max_tw_buckets=262144
sysctl -w net.ipv4.tcp_tw_reuse=1
```

快速统计脚本：

```python
import subprocess
out = subprocess.check_output(['ss', '-tan']).decode()
# 仅统计处于 TIME-WAIT 的行
print('TIME_WAIT count:', sum(1 for l in out.splitlines() if 'TIME-WAIT' in l))
```

还可按目的端口聚合，找出「哪个后端」在消耗端口，定位主动关闭源头：

```python
from collections import Counter
peers = Counter()
for line in out.splitlines():
    if 'TIME-WAIT' in line:
        peer = line.split()[4]          # 形如 peer:port
        peers[peer.rsplit(':', 1)[-1]] += 1
print(peers.most_common(10))            # 找出贡献最大的目的端口
```

## 五、与其他技术对比
连接池与长连接从源头减少握手/挥手次数，优于事后调内核参数；服务网格常通过 sidecar 复用连接进一步降低 TIME_WAIT。相较之下，扩大端口范围与 `tcp_tw_reuse` 是「补救型」手段，无法消除挥手本身。

HTTP/2、HTTP/3 的多路复用把多个请求复用到单条连接，从根本上缓解短连接问题。应用层改造（减少短连接）通常比内核调参收益更持久、风险更低。

| 方案 | 层次 | 根治性 | 风险 | 适用场景 |
| --- | --- | --- | --- | --- |
| 连接池/长连接 | 应用 | 根治 | 低 | 绝大多数场景首选 |
| HTTP/2、HTTP/3 多路复用 | 协议 | 根治 | 低 | Web/RPC |
| 扩大端口范围 | 内核 | 部分 | 低 | 客户端侧补充 |
| `tcp_tw_reuse` | 内核 | 部分 | 低（需时间戳） | 出向连接 |
| 调大 `tcp_max_tw_buckets` | 内核 | 无 | 中（内存） | 仅防内存失控 |
| `tcp_tw_recycle` | 内核 | — | 高 | 已废弃，禁用 |

## 六、常见误区
误区一：把 `tcp_max_tw_buckets` 调得极大以为能「容纳」所有 TIME_WAIT，实际只是提高上限，治标不治本，且占用更多内存。误区二：忽视 `tcp_tw_recycle` 已在新版内核移除，照搬旧文章会导致配置无效甚至连接异常。

误区三：认为服务端的 TIME_WAIT 能用 `tcp_tw_reuse` 消除——该参数只针对出向（客户端）连接。误区四：用 `tcp_tw_reuse` 却不启用 TCP Timestamps，导致复用判定失效。误区五：以为调大端口范围就万事大吉——单一远端四元组下仍受 $C_{max}$ 上限约束。

误区六：看到 TIME_WAIT 数万就断言故障——高 QPS 短连接稳态下这是正常的，应结合端口占用率与 connect 失败率判断。误区七：只看总数不看分布——按目的端口/目的 IP 聚合才能定位真正的压力点。

## 七、与开源书·权威来源对应
- 图解网络（xiaolincoder/hello-http）：给出端口耗尽排查链路与主动关闭方判定。
- Linux `Documentation/networking/ip-sysctl.txt`：描述 `tcp_max_tw_buckets`、`tcp_tw_reuse` 语义。
- Stevens《TCP/IP Illustrated》卷一 18.6：从原理解释 TIME_WAIT 不可简单消除。
- RFC 7323：时间戳与 PAWS，是安全复用的前提。
- RFC 9293：TIME_WAIT 的规范要求。

## 八、面试题
1. 如何判断 TIME_WAIT 由谁主动关闭导致？答：看本地地址是否落在 `ip_local_port_range` 临时端口且远端为固定服务端口；若是，本机即主动关闭的客户端。
2. `tcp_tw_reuse` 与 `tcp_tw_recycle` 区别？答：前者仅出向、依赖时间戳、安全；后者曾激进回收、对 NAT 有害、已移除。
3. 服务端出现大量 TIME_WAIT 怎么办？答：优先让客户端保持连接/连接池，使服务端成为被动关闭方，而非调服务端参数。
4. 端口耗尽但 TIME_WAIT 不多？答：可能 `ip_local_port_range` 过窄或连接对象单一，扩大范围/增加目标即可。
5. 如何用一条命令定位「哪个后端在消耗端口」？答：用 `ss` 过滤 TIME-WAIT 后按目的 IP:Port 聚合计数排序，贡献最大者即压力点。
6. 为什么调大 `tcp_max_tw_buckets` 有副作用？答：它允许更多 TIME_WAIT 项驻留内存，只是把「连接被拒」换成「内存增长」，并未提高真实并发上限。

## 九、演进与趋势
云原生环境下短生命周期 Pod 频繁建连，推荐在客户端启用 `tcp_tw_reuse` 并配合连接池；内核侧不再提供激进回收开关，正确性优先。eBPF 等可观测工具（如 `ss`、bpftrace）让 TIME_WAIT 的实时分布与生命周期更易观测，从「调参」走向「按数据决策」。

自动化诊断脚本可周期性聚合四元组，在端口占用达阈值前预警，把被动救火变为主动容量规划。

## 十、小结
TIME_WAIT 排查先于调优：先定位主动关闭方与连接模型，再辅以 `tcp_tw_reuse`、扩大端口范围与连接池，避免依赖已废弃参数。根本解法往往是减少不必要的短连接挥手，而非与协议状态对抗。牢记「数量本身不是故障证据，端口占用率与失败率才是」。
