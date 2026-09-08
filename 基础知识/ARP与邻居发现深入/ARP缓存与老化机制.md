# ARP缓存与老化机制

> 对应 RFC 826 (ARP) 与 Linux 内核邻居子系统实现。

## 一、背景与挑战
每次发包都做 ARP 广播代价高且增加广播流量，因此主机缓存 IP-MAC 映射。但网络拓扑变化（MAC 变更、IP 迁移）要求缓存能及时失效刷新，避免陈旧映射导致丢包。

## 二、核心原理
Linux 邻居表（neigh）对每个表项维护状态机：NUD_NONE、NUD_REACHABLE（可达，有有效期）、NUD_STALE（可疑）、NUD_DELAY、NUD_PROBE（探测中）。REACHABLE 到期且无流量则转 STALE，下次发包触发确认，不可达时进入 PROBE 发单播 ARP 验证。

## 三、形式化与数学基础
可达态基时间 `base_reachable_time`（默认约 30 秒），加随机抖动：
$$ T_{reach} = \text{base} \cdot (0.5 + \text{random}()) $$
gc 回收间隔 `gc_stale_time` 清理不可用项：
$$ T_{stale}^{gc} = \text{gc_stale_time} $$

## 四、代码实现
内核参数查看与调整：
```bash
sysctl net.ipv4.neigh.default.base_reachable_time_ms
sysctl net.ipv4.neigh.default.gc_stale_time
ip neigh show nud stale
```
程序化读取邻居：
```python
import subprocess
print(subprocess.check_output(['ip','neigh']).decode())
```

## 五、与其他技术对比
静态 ARP 条目（`nud permanent`）不过期但需手工维护；动态老化自适应但可能短时误用旧映射。NDP 的邻居不可达检测 NUD 机制类似但更完善。

## 六、常见误区
误区一是把 `arp -a` 看到的条目都当当前有效，其中可能含 stale/incomplete。误区二是调大超时能「稳定」连接，反而延长陈旧映射危害。

## 七、与开源书/权威来源对应
RFC 826 隐含缓存需求；Linux `Documentation/networking/nexthop` 与邻居子系统描述 NUD 状态；xiaolincoder 提及 ARP 缓存表。

## 八、面试题
问：为什么 ARP 表项会进入 STALE？答：可达计时到期后内核不立即探测，标为可疑，待有流量需要发送时再验证，平衡及时性与开销。

## 九、演进与趋势
大型云网络采用 ARP 代理与控制器下发，减少终端自学习广播；EVPN 用 BGP 分发 MAC/IP 表替代泛洪学习。

## 十、小结
ARP 缓存以 NUD 状态机管理可达性与老化，在性能与正确性间权衡。理解状态迁移有助于排查时通时断的局域网问题。
