> 对应 Tanenbaum《Modern Operating Systems》「Page Replacement」与 Linux 内核 Documentation（vm/）。

## 一、背景与挑战
当空闲页低于阈值时，分配路径不能无限等待——既要在后台平滑回收以防阻塞应用，又要在紧急时让申请者自己同步回收。挑战是划分「后台异步」与「前台同步」的边界，避免抖动与分配延迟尖刺。

## 二、核心原理
每个 NUMA 节点有一个 kswapd 内核线程。节点维护三个水位线：min、low、high。空闲页低于 low 时唤醒 kswapd 异步回收直到回到 high；分配时发现低于 min 则触发直接内存回收（direct reclaim），由当前进程在分配路径上同步执行 shrink 逻辑。这种「水线 + 后台线程」机制把大部分回收成本转移到 kswapd，降低前台延迟。

## 三、形式化与数学基础
设空闲页数 f，水位为 w_min < w_low < w_high。状态机：
```
f >= w_high        -> 空闲，无需动作
w_low <= f < high  -> 唤醒 kswapd，前台继续
w_min <= f < low   -> kswapd 忙碌，前台可能直接回收
f < w_min          -> 强制直接回收 + OOM 候选
```
kswapd 的「回收量目标」通常取 (w_high - f)，保证一次回收后越过 high，避免频繁唤醒。

## 四、代码实现
```c
// 简化自 mm/vmscan.c
static int balance_pgdat(pg_data_t *pgdat, int order, int classzone_idx)
{
    do {
        for (zone = pgdat->node_zones + classzone_idx; zone >= pgdat->node_zones; zone--)
            shrink_zone(zone, &sc);          // 按优先级收缩
    } while (nr_reclaimed < sc.nr_to_reclaim &&
             !pgdat_balanced(pgdat, order, classzone_idx));
    return 0;
}

// 分配路径中的阈值判断
if (alloc_flags & ALLOC_WMARK_LOW)
    if (zone_watermark_ok(zone, order, low, ...))
        goto got_pg;
```

## 五、与其他技术对比
- 纯前台回收：每次分配都扫描，延迟不可控。
- 纯后台回收（仅 kswapd）：突发分配可能饿死。
- Linux 混合：水线分层 + 直接回收兜底，兼顾吞吐与延迟。

## 六、常见误区
- 误区：kswapd 能回收所有页。实际它不会回收到低于 low 以下太多，避免系统过脆。
- 误区：直接回收很罕见。内存紧张时大量进程同时陷入 direct reclaim，会放大锁竞争。

## 七、与开源书/权威来源对应
- Tanenbaum《Modern Operating Systems》第 4 章描述分页守护进程（paging daemon）概念。
- Linux 内核 Documentation/admin-guide/mm/concepts.rst 解释 watermark。
- GitHub CyC2018/CS-Notes 的「内存管理」小节概括水位线。

## 八、面试题
1. min、low、high 三个水位各自的语义？
2. 什么条件下当前进程会进入直接内存回收而非等待 kswapd？
3. 为什么 kswapd 回收目标是回到 high 而非 low？

## 九、演进与趋势
早期 2.4 仅有 kswapd 单线程；后续引入 per-node pgdat、numa balancing 与 memory tiering，kswapd 也逐渐支持对 demoted 页的处理。趋势是把回收与 NUMA/分层内存（如 CXL）结合。

## 十、小结
kswapd 与直接内存回收通过水位线把「后台平滑回收」与「前台紧急回收」解耦，是 Linux 内存压力管理的骨架。
