# RSM快照与日志压缩

> 对应 Ongaro & Ousterhout 2014（Raft 的 Log Compaction 一节）；Kleppmann《DDIA》第 3 章（存储引擎与 LSM-tree）；O'Neil et al. 1996（The Log-Structured Merge-Tree）。

## 一、背景与挑战
命令日志只增不减：长期运行后日志体积持续膨胀，导致三类问题——**磁盘占用失控**、**重启恢复时间随日志长度线性增长**、以及**给落后副本同步时需要传输大量历史命令**。快照（snapshot）是把「某一点的状态」持久化，之后日志可截断到该点。这样恢复就变成「加载快照 + 重放之后的少量日志」。

难点在于三个衔接问题：其一，**何时快照**——阈值驱动还是定时驱动，快照期间能否继续处理写入；其二，**快照与日志如何对齐**——必须记录快照覆盖到的日志位置（`last_included_index` 与对应的 `last_included_term`），否则恢复时无法确定从哪条日志继续；其三，**恢复与落后副本同步**——如果落后副本需要的日志已被截断，只能改用「传快照」的方式追赶，这就要求快照本身可传输、可校验、且传输过程不能阻塞主流程。此外，边写边快照会产生**状态不一致**风险（快照里包含了部分新状态），需要写时复制、冻结或分代复制来隔离。

## 二、核心原理
触发与执行流程通常是：当日志项数（或字节数）超过阈值 $K$，副本对当前已 apply 的状态做一次快照，写入 `(snapshot_data, last_included_index, last_included_term)`，然后把 `last_included_index` 之前的日志删除。恢复时先加载快照得到基准状态 $S_{snap}$，再从 `last_included_index + 1` 开始逐条 apply 直到 `commit_index`。

**一致性的保证来自与 apply 游标的绑定**：快照必须对应某个确定的 apply 位置，即「已应用 $c_1 \dots c_k$ 之后的状态」。因此快照应基于 FSM 的当前状态生成，并同时记录该状态对应的 index，二者必须在同一临界区内取值，否则会出现「状态是 k+3 的、index 写的是 k」这种致命错位。

**落后副本的追赶**用 InstallSnapshot 类机制：领导者把快照分块发送（分块是为了避免单次消息过大与超时），跟随者接收完成后加载并重置自己的日志与 apply 游标，然后再继续接收常规的日志追加。分块传输需要处理中断与重传，且要保证「部分接收的快照不被误用」——通常用临时文件 + 校验 + 原子重命名来落地。

**快照频率的权衡**很明显：太频繁会导致 IO 抖动、CPU 争用（序列化本身很贵）并可能影响正常写入延迟；太稀疏则单次快照体积大、恢复时间长、落后副本追赶成本高。工程上常用「阈值 + 冷却时间」双约束，或让快照在后台低优先级执行。

## 三、形式化与数学基础
设快照覆盖日志区间 $[1, k]$，其包含的状态为
$$ S_{snap} = \delta^{*}(S_0,\ c_1 \dots c_k) $$
则恢复后状态为
$$ S = \delta^{*}\big(S_{snap},\ c_{k+1} \dots c_{commit}\big) $$
**恢复时间**由「加载快照」与「重放剩余日志」两部分构成：
$$ T_{recover} = \frac{|S_{snap}|}{B_{load}} + (commit - k)\cdot t_{apply} $$
其中 $|S_{snap}|$ 为快照字节数、$B_{load}$ 为加载带宽、$t_{apply}$ 为单条命令 apply 时间。该式说明：快照越大恢复越慢（磁盘/网络传输）而重放量越小；最优的 $k$ 取决于 $|S_{snap}|(k)$ 的增长速度与 $t_{apply}$ 的相对大小，是一个显式的极小化问题：
$$ k^{*} = \arg\min_k \left[\frac{|S(k)|}{B_{load}} + (T_{total} - k)\cdot t_{apply}\right] $$
**压缩比**可定义为
$$ R = \frac{\text{截断前的日志字节数}}{\text{快照字节数}} $$
稳态下日志增长率为 $\lambda$ 字节/秒、快照阈值为 $K$ 字节，则快照频率
$$ f_{snap} \approx \frac{\lambda}{K} $$
即阈值越大频率越低但单次成本越高，二者乘积（单位时间快照成本）近似为 $\lambda \cdot \frac{|S|}{K}$，因此应让 $K$ 随状态规模动态调整，而不是固定常数。若考虑快照期间写时复制的额外内存峰值 $M_{peak} \approx |S_{mod}|$（被修改部分），则还需保证
$$ M_{available} \ge |S_{mod}| + M_{headroom} $$
否则快照会引发内存压力甚至 OOM——这是大规模状态下最常见的失败模式。

## 四、代码实现
快照生成与截断（示意，含一致性对齐）：
```python
import os, json, hashlib, tempfile

def take_snapshot(sm, log, snap_path):
    # ① 在临界区内同时取状态与对应的 apply 位置
    with sm.lock:
        last_idx = sm.last_applied
        last_term = log.term_at(last_idx)
        data = sm.serialize()                 # 需确定性序列化（键排序）
    # ② 原子落盘：临时文件 + fsync + 重命名，避免半个快照被读到
    blob = json.dumps({"data": data, "index": last_idx, "term": last_term},
                      sort_keys=True).encode()
    d = os.path.dirname(snap_path)
    fd, tmp = tempfile.mkstemp(dir=d)
    with os.fdopen(fd, "wb") as f:
        f.write(blob)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, snap_path)                # 原子替换
    # ③ 仅在快照安全落盘后截断日志
    log.truncate_before(last_idx)

def restore(snap_path, log, sm, delta):
    with open(snap_path, "rb") as f:
        snap = json.loads(f.read())
    sm.state = snap["data"]
    sm.last_applied = snap["index"]
    for i in range(snap["index"] + 1, log.commit_index + 1):
        sm.state = delta(sm.state, log[i].command)   # 只重放快照之后的项
        sm.last_applied = i
```

分块安装快照（示意）：
```python
def install_snapshot(leader, follower, snap_path, chunk=1 << 20):
    offset, size = 0, os.path.getsize(snap_path)
    follower.begin_snapshot(size)
    with open(snap_path, "rb") as f:
        while offset < size:
            data = f.read(chunk)
            follower.append_chunk(offset, data)      # 可重传，需幂等
            offset += len(data)
    follower.finish_snapshot(sha256_of(snap_path))   # 校验通过才生效
```

## 五、与其他技术对比
| 维度 | RSM 快照 | LSM-tree compaction | WAL 截断 | 数据库 checkpoint | 增量备份 |
| --- | --- | --- | --- | --- | --- |
| 压缩对象 | FSM 状态（应用层语义） | 有序文件（存储层） | 日志文件 | 脏页与日志 | 变更集 |
| 是否跨节点传输 | 可以（落后副本追赶） | 通常本机 | 本机 | 本机 | 可传输 |
| 触发方式 | 日志阈值 + 冷却 | 层级大小/写放大 | 检查点推进 | 定时/阈值 | 全量基线 + 变更 |
| 主要收益 | 缩短恢复与追赶时间 | 降低读放大与空间 | 回收空间 | 缩短崩溃恢复 | 降低备份成本 |
| 主要代价 | 序列化 CPU 与内存峰值 | 写放大与 IO 抖动 | 恢复点前移 | IO 抖动 | 依赖变更追踪 |
| 关键不变量 | index/term 与状态对齐 | 层级有序性 | 已提交不丢 | 页与日志一致 | 与全量基线一致 |

## 六、常见误区
1. **「快照不记 last_included_index 也能恢复」**——错。没有 index/term，恢复时无法与日志对齐，也无从判断从哪条继续重放。
2. **「边写边快照不需要隔离」**——错。序列化期间状态被并发修改会产生撕裂快照；需要写时复制、冻结或分代复制，且必须记录对应的 apply 位置。
3. **「快照越频繁越安全」**——错。频繁快照带来 IO 抖动、CPU 争用与内存峰值，反而可能拖垮服务；应阈值 + 冷却双约束，并避开业务高峰。
4. **「快照落盘和日志截断可以乱序」**——错。必须先确认快照完整落盘（fsync + 原子重命名）再截断日志，否则崩溃后既没有快照也没有日志，状态永久丢失。
5. **「快照可以直接给落后副本用」**——错。传输需分块、可重传、带校验，并防止半个快照被加载；加载后还要重置日志与 apply 游标。

## 七、与开源书·权威来源对应
- Ongaro & Ousterhout 2014（Raft）：论文中「Log Compaction」一节专门讨论快照、`last_included_index/term` 与 InstallSnapshot。
- Lamport 1998（Paxos）：理解日志为何可截断需先理解「已提交即不可回退」。
- Kleppmann《Designing Data-Intensive Applications》第 3 章：存储引擎中的压缩、checkpoint 与恢复机制。
- O'Neil et al. 1996（LSM-Tree）：存储层压缩与写放大的经典分析，与状态层快照形成对照。
- Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》：文件 IO、fsync 与原子重命名的系统层基础。
- Tanenbaum《Modern Operating Systems》：文件系统一致性与崩溃恢复，理解「原子替换」为何必要。

## 八、面试题
1. **快照后日志如何截断？** 要点：保留 `last_included_index` 之后的日志项，之前的可删除；恢复时先加载快照再 apply 剩余日志。
2. **为什么快照必须记录 index 与 term？** 要点：用于与日志对齐、判断从哪继续重放，并提供给落后副本作为新的日志起点。
3. **边写边快照如何保证一致？** 要点：写时复制/冻结/分代复制，且在临界区内同时取状态与其对应的 apply 位置，保证「状态与 index 匹配」。
4. **落后副本需要的日志已被截断怎么办？** 要点：改用 InstallSnapshot 分块传输快照，校验通过后加载并重置日志与游标，再恢复常规追加。
5. **快照频率如何选？** 要点：按日志增长率与状态规模动态调整阈值，配合冷却时间与低优先级后台执行，避免 IO 抖动与内存峰值。

## 九、演进与趋势
方向一是**增量快照**：只记录相对上一版快照的差异，降低序列化与传输成本，代价是需要维护多层快照链并在链过长时做全量合并。方向二是**与存储引擎 checkpoint 结合**：把 FSM 的状态直接委托给 LSM 引擎，用其 checkpoint/snapshot 机制替代自研序列化，减少双份状态与额外 CPU。方向三是**并行与后台快照**：利用写时复制、分片并行序列化，把快照对在线延迟的影响压到更低。方向四是**快照即传输**：让新加入的副本直接以「接收快照」的方式加入，而不是重放历史日志，从而缩短扩容时间。具体阈值、格式与实现**以官方最新文档为准**。

## 十、小结
快照把「重放全日志」变成「基准加增量」，是 RSM 长期运行的必备压缩手段：它同时解决了空间膨胀、恢复时间与落后副本追赶三个问题。其正确性依赖三条铁律——**快照必须与 apply 位置严格对齐（index/term）**、**快照期间必须隔离并发修改**、**快照完整落盘后才能截断日志**。工程上真正需要权衡的是频率与成本：阈值越大越省 CPU 但恢复越慢、单次内存峰值越高；理想做法是让阈值随状态规模动态调整，并把快照放到后台低优先级执行。
