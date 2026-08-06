# Linux 性能排查手册

## 〇、本体介绍

**Linux 排查**：线上出问题（CPU 飙、内存涨、IO 卡、网络抖、进程假死）时，用一套命令与工具**量化定位瓶颈**，而非瞎猜。它是后端工程师的「听诊器」。

**四大资源维度**：CPU、内存、IO（磁盘/网络）、进程/线程。每类都有「看现象 → 找进程 → 定根因」的方法。

**核心思路**：**先整体（top/负载），再细分（per-资源工具），最后进进程（strace/perf/火焰图）**。配合日志与可观测性（见 云原生/可观测性.md）。

---

## 一、CPU 排查

- **整体**：`top` / `htop`（看 %CPU、负载 load average）、`uptime`（1/5/15 分钟负载）。
- **负载高但 CPU 不高？** 多为 IO 等待（D 状态）或锁竞争，看 `wa%`、看进程状态。
- **找热点**：`perf top` 实时看函数级 CPU 占用；`perf record -g` + `perf report` 抓调用栈。
- **火焰图（Flame Graph）**：`perf script | stackcollapse | flamegraph.pl`，一眼看「哪段代码吃 CPU」。
- **上下文切换**：`vmstat 1` 看 `cs`（cs 过高可能是大量线程争抢/锁）、`pidstat -w` 看进程切换。

---

## 二、内存排查

- **整体**：`free -h`（看 available 而非 free，含缓存可回收）、`top` 的 RES。
- **进程级**：`ps -eo pid,comm,rss` 按 RSS 排序找大头；`smem` 看 PSS（按比例共享）。
- **泄漏**：`pmap -x <pid>` 看进程内存映射；长期监控 RSS 增长曲线；结合 JVM 的 `jstat`/堆 dump（Java 应用）。
- **OOM**：`dmesg | grep -i oom` 看被谁杀；`/var/log/messages` 查 OOM Killer 记录。
- **缓存**：`cache` 是页缓存（可回收），`available` 才是真可用；不要被 `free` 低吓到。

---

## 三、磁盘 IO 排查

- **整体**：`iostat -x 1`（看 `%util`、`await`、`r/s w/s`）、`vmstat`（io 列）。
- **找进程**：`iotop`（按进程看读写）、`pidstat -d`。
- **文件系统**：`df -h`（空间）、`du -sh`（目录占用）、`lsof | grep deleted`（已删但仍被进程占用的文件，空间不释放）。
- **慢盘/坏盘信号**：`await` 远大于 `svctm`、`%util` 接近 100%。

---

## 四、网络排查

- **连通性**：`ping`（延迟/丢包）、`telnet/nc -vz`（端口通不通）、`traceroute/mtr`（路径与丢包点）。
- **连接与监听**：`ss -lantp`（替代 netstat，看连接状态/监听）、`netstat -an | grep TIME_WAIT` 看短连接风暴。
- **抓包**：`tcpdump -i any -n port 8080 -w x.pcap`（分析重传/乱序/握手）；Wireshark 离线看。
- **DNS**：`dig` / `nslookup` / `getent hosts`；`/etc/resolv.conf` 配置。
- **网卡/带宽**：`sar -n DEV 1`（吞吐）、`ethtool eth0`（速率/双工）。
- **TIME_WAIT 过多**：调 `net.ipv4.tcp_tw_reuse`、用长连接 / 连接池。

---

## 五、进程与线程

- **进程树**：`ps auxf` / `pstree`。
- **线程**：`top -H -p <pid>`（看线程级 CPU）、`ps -eLf | grep <pid>`。
- **死锁/卡住**：`strace -p <pid>` 看系统调用是否卡在某调用（如 futex 死锁、read 阻塞）；`cat /proc/<pid>/stack` 看内核栈。
- **打开文件**：`lsof -p <pid>`、`ls /proc/<pid>/fd | wc -l`（fd 泄漏 → 报 "too many open files"，需调 `ulimit -n`）。

---

## 六、JVM 应用专项（Java 后端）

- `jps` 列进程；`jstack <pid>` 看线程栈（死锁/ BLOCKED / GC 频繁）；`jstat -gcutil` 看 GC；`jmap -dump` 抓堆（MAT 分析泄漏）；`arthas` 在线诊断（watch/trace）。

---

## 七、经典排障 SOP（案例）

- **案例 A：接口变慢** → `top` 看 CPU → `perf/火焰图` 定热点函数 → 优化算法/缓存。
- **案例 B：内存涨到 OOM** → `free`/`dmesg oom` → `pmap`/`jmap` 找泄漏对象 → 修引用。
- **案例 C：磁盘满** → `df`/`du` 定位大文件 → `lsof | grep deleted` 清被占已删文件。
- **案例 D：连接不上** → `ss -lantp` 看监听 → `telnet` 测端口 → `tcpdump` 抓包看握手。

---

## 八、与其他板块的关系

- **基础知识 / 操作系统**：本手册是「机制」，「[操作系统](操作系统.md)」是「原理」——D 状态、上下文切换、OOM、页缓存都是那里的概念在命令层的落地。
- **云原生 / K8s**：`kubectl exec` 进容器后就是这套命令；`kubectl logs/describe` 是容器层封装。
- **云原生 / 可观测性**：指标/日志/链路是宏观，本手册是单机微观下钻。
- **场景设计 / 问题定位**：本手册是其落地工具集。

---

## 九、速查表

| 维度 | 先看 | 再细分 |
|------|------|--------|
| CPU | top / uptime | perf top / 火焰图 / vmstat(cs) |
| 内存 | free -h / top RES | pmap / smem / dmesg oom |
| IO | iostat -x / vmstat | iotop / pidstat -d / lsof deleted |
| 网络 | ping / ss -lantp | tcpdump / sar -n DEV / dig |
| 进程 | ps / top -H | strace / lsof / jstack |

---

## 面试高频问题（20+ 条）

1. **负载（load average）高怎么查？** 先看 top：CPU 高还是 wa/IO 等待；再 perf/iotop 细分。
2. **load 高但 CPU 不高说明啥？** 多在等 IO（D 状态）或锁/上下文切换；看 wa%、cs。
3. **如何找 CPU 热点函数？** perf top 实时；perf record+report 或火焰图定位。
4. **火焰图怎么看？** 横轴是采样时长占比，最宽的函数最耗 CPU；自底向上是调用栈。
5. **free 很低但 available 高？** 是页缓存占用，可回收，不算真缺内存。
6. **OOM 怎么排查？** dmesg | grep oom 看被杀进程；查 /var/log/messages；优化内存/调 -Xmx。
7. **内存泄漏怎么定位？** 监控 RSS 增长；pmap/jmap 抓映射/堆；MAT 分析泄漏对象。
8. **磁盘 IO 瓶颈指标？** iostat -x 看 %util、await；接近 100% 且 await 高即瓶颈。
9. **已删文件空间不释放？** 被进程占着（lsof | grep deleted），需重启进程或清空 fd。
10. **TIME_WAIT 过多怎么办？** 复用连接/连接池；开 tcp_tw_reuse；避免短连接风暴。
11. **怎么看某个端口谁在监听？** ss -lantp | grep :端口（比 netstat 快）。
12. **tcpdump 怎么抓 8080？** tcpdump -i any -n port 8080 -w x.pcap，Wireshark 分析。
13. **进程卡死怎么查？** strace -p 看卡在哪个系统调用；cat /proc/pid/stack 看内核栈。
14. **too many open files 原因？** fd 泄漏；lsof 查进程 fd 数，调 ulimit -n。
15. **上下文切换高意味着？** 大量线程切换/锁竞争；vmstat cs、pidstat -w 定位。
16. **如何查 DNS 解析问题？** dig/nslookup/getent hosts；查 /etc/resolv.conf。
17. **Java 应用排查工具？** jstack(线程)/jstat(GC)/jmap(堆)/arthas(在线 watch/trace)。
18. **top 里 RES 和 VIRT 区别？** RES 实际物理内存；VIRT 含映射的虚拟（含未驻留）。
19. **sar 是什么？** 系统活动报告，可回看历史 CPU/IO/网络（历史采样）。
20. **网络带宽怎么看？** sar -n DEV 1 或 iftop；ethtool 看网卡速率。
21. **如何确认是应用慢还是网络慢？** 本地 curl 测延迟 vs 跨网络；tcpdump 看握手/重传。
22. **排查 SOP 顺序？** 整体(top/负载)→分资源(iostat/perf/ss)→进进程(strace/jstack)→结合日志。
