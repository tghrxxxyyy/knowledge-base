# HNSW 图索引

> 对应 facebookresearch/faiss 的 IndexHNSW 实现（基于分层可导航小世界图）。

## 一、背景与挑战
IVF 需调 nprobe 且召回不稳。HNSW 用多层图结构实现近对数级检索，精度高、延迟低，是很多向量库的默认引擎。

## 二、核心原理
构建分层图：顶层稀疏负责大跨度跳转，底层稠密负责精细近邻。插入时从顶层贪心下降，在每层连边给近邻；查询同样逐层贪心逼近，最终在底层得近邻。

## 三、形式化与数学基础
在层 l 的近邻搜索：从入口点出发，迭代移动到比当前更近的邻居，直至局部最小。期望复杂度约 $O(\log N)$。边数为 $O(N \cdot M)$，M 控制图连通度。

## 四、代码实现
```python
import faiss
index = faiss.IndexHNSWFlat(128, 32)   # M=32 近邻数
index.add(data)
D, I = index.search(q, 10)
```

## 五、与其他技术对比
相比 IVF，HNSW 通常更高召回且无需调 nprobe，但占内存（存图）、构建较慢；相比 PQ，精度高但不压缩。生产常按内存选其一。

## 六、常见误区
误区一：M 越大越好，过大内存与构建成本飙升。误区二：认为 HNSW 不需训练，其实 add 即建图，数据分布变化需重建。

## 七、与开源书/权威来源对应
- facebookresearch/faiss 提供 IndexHNSWFlat/IndexHNSWPQ。
- facebookresearch/faiss 图索引文档。
- Kwon et al. 2023 高效近邻服务。

## 八、面试题
1. HNSW 分层的作用？
2. 参数 M 与 efSearch 影响什么？
3. HNSW 为何内存占用大？

## 九、演进与趋势
磁盘/分布式 HNSW 与量化版（HNSW+PQ）结合，兼顾速度与内存，支撑超大规模在线检索。

## 十、小结
HNSW 以图结构实现高召回低延迟检索，是现代向量库的主流选择之一。
