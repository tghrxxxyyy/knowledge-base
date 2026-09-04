# LSM树对比

> 对应 O'Neil et al. LSM 论文（1996），以及 DDIA 中文第 3 章 SSTable 与 LSM-Tree。

## 一、背景与挑战
B+ 树每次写入都随机更新页，写放大严重。日志结构合并树（LSM-Tree）将随机写转化为顺序写，适合写密集负载，代价是读放大与空间放大。

## 二、核心原理
写入先进内存 MemTable（有序结构如跳表），写满后刷成不可变的 SSTable 文件落盘；后台 Compaction 将多层 SSTable 归并去重。读取先查 MemTable 再逐层查 SSTable，常配布隆过滤器加速。

## 三、形式化 / 数学基础
写放大约 $W_{amp} \approx \frac{\text{每层大小比 } T \cdot \text{层数}}{1}$（随层数比 $T$ 增大而降低）。读放大最坏 $O(L)$ 层。Leveled 优于 Size-Tiered 于读放大但写放大更高。

## 四、代码实现
```go
// 简化的 Get：从新到旧查层
func (db *DB) Get(key string) (string, bool) {
    if v, ok := db.mem.get(key); ok { return v, true }
    for _, lvl := range db.levels { // 新 -> 旧
        if v, ok := lvl.lookup(key); ok {
            if v != tombstone { return v, true }
            return "", false
        }
    }
    return "", false
}
```

## 五、与其他技术对比
| 维度 | B+ 树 | LSM |
|------|-------|-----|
| 写 | 随机、写放大高 | 顺序、写放大低 |
| 读 | 稳定低延迟 | 可能多层 |
| 空间 | 紧凑 | 暂存多版本 |

## 六、常见误区
1. LSM 无读放大——错，多层与墓碑带来读/空间放大。
2. Compaction 不耗资源——实际是后台瓶颈。
3. 布隆过滤器能去重——只判存在，不保证值。

## 七、与开源书 / 权威来源对应
- DDIA 中文第 3 章: https://github.com/Vonng/ddia
- LSM 原论文 O'Neil 1996.
- RocksDB 文档: https://github.com/facebook/rocksdb

## 八、面试题
1. LSM 为什么写快？代价在哪？
2. Compaction 的两种策略区别？
3. 墓碑（tombstone）作用？

## 九、演进与趋势
Tiered+Leveled 混合、分区合并、向量化 compaction（如 Sled、TerarkDB 冷热分离）持续降低放大。

## 十、小结
LSM 以顺序写换取写吞吐，用 compaction 与布隆过滤器平衡读；理解放大三要素（写/读/空间）是选型关键。
