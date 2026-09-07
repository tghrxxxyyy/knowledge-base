# LSM树整体架构与写路径

> 对应 O'Neil et al. 1996, *The Log-Structured Merge-Tree*（LSM-tree 原始论文），以及 Vonng/ddia 中文翻译《数据密集型应用系统设计》第 3 章。

## 一、背景与挑战
传统 B+ 树在写密集型负载下随机写放大严重：磁盘随机写 IOPS 远低于顺序写。LSM-tree 将随机写转换为“顺序写日志 + 后台合并”，以读放大和空间放大为代价换取高写入吞吐，是 LevelDB、RocksDB、Cassandra、HBase 的存储基石。

## 二、核心原理
写路径：请求先追加到 WAL（预写日志）保证持久性，再写入内存 MemTable（多为跳表/平衡树）。MemTable 写满后冻结为 Immutable MemTable，后台线程将其刷写为磁盘上的 SSTable 文件。读路径：先查 MemTable，再按层级从新到旧查 SSTable，借助 Bloom Filter 跳过不可能命中的文件。Compaction 后台合并并清理过期版本。

## 三、形式化与数学基础
写放大（Write Amplification）：
$$ WA = \frac{W_{actual}}{W_{logical}} $$
设每层大小为上一层的 $T$ 倍（fanout），$L$ 个层级，则 Leveled 策略下 $WA \approx L \cdot T$（典型 10~40）。读放大随层级与文件数增长：
$$ RA \approx \sum_{i=0}^{L-1} B_i $$
其中 $B_i$ 为第 $i$ 层需检查的 SSTable 数（经 Bloom Filter 后常接近 1）。

## 四、代码实现
```c
// 简化的 MemTable 跳表插入（仅示意）
typedef struct Node {
    uint64_t key;
    char*    val;
    struct Node** fwd;  // 多层前向指针
} Node;

void memtable_put(Node* head, uint64_t key, char* val) {
    Node* update[MAX_LVL];
    Node* x = head;
    for (int i = MAX_LVL - 1; i >= 0; i--) {  // 自顶向下查找
        while (x->fwd[i] && x->fwd[i]->key < key) x = x->fwd[i];
        update[i] = x;
    }
    x = x->fwd[0];
    if (x && x->key == key) { x->val = val; return; }
    Node* n = node_new(key, val);             // 插入新节点
    for (int i = 0; i < n->level; i++) {
        n->fwd[i] = update[i]->fwd[i];
        update[i]->fwd[i] = n;
    }
}
```

## 五、与其他技术对比
B+ 树：点查/范围查稳定，写放大低但随机写慢。LSM：写吞吐高，读放大与空间放大高。Fractal Tree 在节点内缓存消息降低写放大；WiscKey 将 value 分离存储以减少写放大；Bitcask 则用仅追加日志 + 内存哈希索引。

## 六、常见误区
1) 认为 LSM 读一定慢——热点经 Bloom Filter 与缓存可控。
2) 忽视空间放大导致磁盘爆满——需调 compaction 策略与压缩。
3) 误以为 WAL 可省略——无 WAL 则 MemTable 丢失即丢数据。

## 七、与开源书/权威来源对应
- O'Neil et al. 1996, *The Log-Structured Merge-Tree*。
- Vonng/ddia（DDIA 中文翻译）第 3 章“存储与检索”。
- cmu-db/15445-course：B+ Tree 与 LSM 对比 lecture。

## 八、面试题
1) LSM 为什么写比 B+ 树快？写放大如何计算？
2) Compaction 的作用与副作用？
3) Bloom Filter 在 LSM 中减轻哪种放大？

## 九、演进与趋势
Tiered+Leveled 混合 compaction（RocksDB）、与 NVMe/分层存储结合、基于 learned index 的 SSTable 路由、WiscKey/HashKV 的 KV 分离、冷热分层降低 SA。

## 十、小结
LSM-tree 以“顺序写 + 后台合并”换取写吞吐，代价是读/空间放大；理解 WA/RA/SA 三者互相制约是工程调参核心。
