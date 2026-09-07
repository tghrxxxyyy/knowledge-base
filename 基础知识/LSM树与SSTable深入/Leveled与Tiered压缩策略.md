# Leveled与Tiered压缩策略

> 对应 Vonng/ddia 中文翻译第 3 章（compaction 讨论），以及 cmu-db/15445-course 关于 LSM compaction 的 lecture。

## 一、背景与挑战
Compaction 决定数据如何在层级间流动，直接决定 WA/RA/SA 的取舍。Leveled 与 Tiered 是两种经典策略，RocksDB/Cassandra 等分别在二者间权衡。

## 二、核心原理
- Leveled：每一层由多个不重叠的 SSTable 组成，合并时与下一层重叠文件做归并，保证层内无重叠，故空间放大低、点查快，但写放大高。
- Tiered：每一层由多个可重叠的 SSTable 组成，合并时仅把整层文件合并后下沉，写放大低，但空间放大高、点查需查多文件。

## 三、形式化与数学基础
设 fanout 为 $T$、层数 $L$。Leveled 单条记录下沉需重写整层，写放大：
$$ WA_{leveled} \approx L \cdot T $$
Tiered 仅整层归并，写放大：
$$ WA_{tiered} \approx T $$
空间放大：Leveled $SA \to 1$（已合并），Tiered $SA \approx L$。

## 四、代码实现
```python
# 选择 compaction 策略的简化启发式（仅示意）
def pick_strategy(write_heavy, space_budget):
    if write_heavy and space_budget > 3.0:
        return "tiered"     # 写多且磁盘宽裕：低写放大
    return "leveled"        # 默认低空间放大

def overlaps(a, b):
    return a.max_key >= b.min_key and b.max_key >= a.min_key
```

## 五、与其他技术对比
Leveled 适合读多/空间受限；Tiered 适合写密集且磁盘充足。Universal（RocksDB）与 FIFO 是 Tiered 的变体；混合策略（如 leveled 前几层 tiered）兼顾两者。

## 六、常见误区
1) 认为 Tiered 读也快——其重叠导致点查跨多文件。
2) 把所有层都设 Leveled——写放大过高拖垮吞吐。
3) 忽略 compaction CPU/IO 抢占前台请求。

## 七、与开源书/权威来源对应
- Vonng/ddia 第 3 章。
- cmu-db/15445-course（LSM compaction）。
- O'Neil et al. 1996（合并思想源头）。

## 八、面试题
1) Leveled 与 Tiered 在 WA/SA 上为何相反？
2) 什么负载适合 Tiered？
3) 如何避免 compaction 风暴？

## 九、演进与趋势
自适应 compaction（依据写/读比动态切换）、subcompaction 并行化、基于 learned 预测重叠以减少重写量。

## 十、小结
Compaction 是 LSM 的“呼吸”：Leveled 省空间、Tiered 省写；现实多用混合策略按层与负载分流。
