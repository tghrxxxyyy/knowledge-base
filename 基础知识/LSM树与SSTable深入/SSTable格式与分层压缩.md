# SSTable格式与分层压缩

> 对应 Chang et al. 2006, *Bigtable: A Distributed Storage System for Structured Data*（SSTable 定义），以及 Vonng/ddia 中文翻译第 3 章。

## 一、背景与挑战
MemTable 落盘后需要一种“不可变、有序、可高效二分查找”的磁盘格式，并支持后台合并去重与删除。SSTable（Sorted String Table）正是满足这些性质的归并友好格式。

## 二、核心原理
SSTable 中的数据按 key 全局有序。典型物理布局：Data Block（key-value 有序块）、Index Block（每个 Data Block 的最后一个 key 与偏移）、Bloom Filter Block、Footer（固定长度指向各块）。读取时先载入 Index，再按需读 Data Block；范围扫描顺序读块即可。

## 三、形式化与数学基础
二分查找定位块与记录复杂度：
$$ T_{seek} = O(\log N) $$
若 Data Block 大小为 $B$、总数为 $M$，则块内定位：
$$ T_{block} = O(\log \frac{B}{entry}) $$
Bloom Filter 误判率：
$$ P \approx (1 - e^{-k n / m})^k $$
其中 $n$ 为元素数、$m$ 为 bit 数、$k$ 为哈希函数个数。

## 四、代码实现
```python
# 简化的 SSTable 块索引定位（仅示意）
def locate(index_blocks, key):
    lo, hi = 0, len(index_blocks) - 1
    while lo < hi:                       # 二分找目标块
        mid = (lo + hi + 1) // 2
        if index_blocks[mid].last_key <= key:
            lo = mid
        else:
            hi = mid - 1
    blk = read_block(index_blocks[lo].offset)
    for kv in blk.entries:               # 块内线性/二分查找
        if kv.key == key:
            return kv.value
    return None
```

## 五、与其他技术对比
相比堆文件（无序、必须全扫），SSTable 有序且可二分；相比 B+ 树页，SSTable 不可变、无原地更新，写入更简单但需 compaction。Parquet/ORC 是面向分析的列存，非点查友好的 KV SSTable。

## 六、常见误区
1) 认为 SSTable 可原地更新——其不可变，更新靠合并。
2) 忽略 Index Block 内存占用，索引过大反而拖慢启动。
3) 误以为 Bloom Filter 能 100% 判定不存在——只保证无假阴性。

## 七、与开源书/权威来源对应
- Chang et al. 2006（Bigtable, SSTable）。
- Vonng/ddia 第 3 章。
- cmu-db/15445-course：存储格式相关 lecture。

## 八、面试题
1) SSTable 为什么要求 key 有序？
2) Index Block 与 Bloom Filter 各解决什么问题？
3) Compaction 如何清理已删除的 key？

## 九、演进与趋势
前缀/差分压缩块（RocksDB BlockBasedTable）、分层块缓存、SSTable 与对象存储直连、列式编码融入 LSM 存储。

## 十、小结
SSTable 以“有序 + 不可变 + 索引/Bloom”让 LSM 兼具高写与可控读；其格式设计直接决定 compaction 效率与读放大。
