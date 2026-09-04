# FAISS 索引类型概览

> 对应 facebookresearch/faiss 开源库与 pytorch/pytorch 张量基础及 Kwon et al. 2023 vLLM 高效服务思想。

## 一、背景与挑战
百万级向量精确最近邻（Exact NN）代价高，无法满足低延迟。FAISS 提供多种近似索引，在精度与速度间权衡，并支持量化压缩以省内存。

## 二、核心原理
FAISS 索引按「是否压缩」「是否图结构」分族：Flat（精确）、IVF（倒排聚类）、PQ（乘积量化压缩）、HNSW（图）。常组合如 IVF+PQ 兼顾速度与内存。

## 三、形式化与数学基础
近似检索目标：以概率召回近似近邻
$\Pr(\|\hat{x}-q\| \le (1+\epsilon)\|x^*-q\|) \ge 1-\delta$
不同索引通过调整候选簇数（nprobe）与量化误差控制该概率与速度。

## 四、代码实现
```python
import faiss
def make_index(dim, nlist=100):
    quant = faiss.IndexFlatL2(dim)
    return faiss.IndexIVFFlat(quant, dim, nlist, faiss.METRIC_L2)
```

## 五、与其他技术对比
Flat 精确但慢且占内存；IVF 快但需训练聚类；PQ 极省内存但损精度；HNSW 快且稳但占内存。组合索引（IVF+PQ）常用于生产。

## 六、常见误区
误区一：索引越大越快，实则需按数据量选 nlist。误区二：忽略训练步骤，IVF 未 train 直接 add 会报错。

## 七、与开源书/权威来源对应
- facebookresearch/faiss 是向量检索事实标准库。
- pytorch/pytorch 张量可用于生成向量。
- Kwon et al. 2023 vLLM 体现高效近邻服务思路。

## 八、面试题
1. 为什么生产常用 IVF+PQ？
2. nprobe 如何影响精度与延迟？
3. 不同距离度量（L2/内积）如何选？

## 九、演进与趋势
GPU FAISS 与磁盘级索引（IVF-on-disk）支持十亿级向量，并与深度学习框架更紧耦合。

## 十、小结
理解 FAISS 索引族是构建可扩展向量检索的基础，选型取决于规模、延迟与内存预算。
