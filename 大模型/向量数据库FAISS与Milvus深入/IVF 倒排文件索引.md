# IVF 倒排文件索引

> 对应 facebookresearch/faiss 的 IndexIVF 实现与 pytorch/pytorch 向量基础。

## 一、背景与挑战
精确 NN 需遍历全体向量。IVF 用聚类把空间划分为若干单元（inverted lists），查询只搜最近的若干单元，大幅降计算。

## 二、核心原理
先用 k-means 在向量上训聚类中心（ coarse quantizer），每个向量归入最近中心形成倒排列表。查询时算与所有中心距离，取最近的 nprobe 个列表，仅在这些列表内做精确比较。

## 三、形式化与数学基础
设聚类中心 $\{c_1,\dots,c_n\}$，分配：
$a(x) = \arg\min_j \|x - c_j\|^2$
查询候选集 $\mathcal{L} = \{ L_j \mid j \in \text{top}_{nprobe}(\|q-c_j\|) \}$，再在 $\bigcup \mathcal{L}$ 中找最近邻。

## 四、代码实现
```python
import faiss
index = faiss.IndexIVFFlat(faiss.IndexFlatL2(128), 128, 256)
index.train(data)        # 必须训练
index.add(data)
index.nprobe = 16         # 搜索的列表数
D, I = index.search(q, 10)
```

## 五、与其他技术对比
相比 Flat，IVF 通过缩小搜索范围提速 10-100x；相比 PQ，它未压缩向量、精度高但内存大。常作为 PQ 的外层。

## 六、常见误区
误区一：nprobe 越大越准但越慢，需调。误区二：忘记 train，IVF 不可用。误区三：聚类数 nlist 过小导致列表过长。

## 七、与开源书/权威来源对应
- facebookresearch/faiss 提供 IndexIVF 系列。
- pytorch/pytorch 可用于自定义聚类。
- Kwon et al. 2023 高效检索服务思想相关。

## 八、面试题
1. nprobe 与召回率的关系？
2. 聚类中心数 nlist 如何选取？
3. IVF 为何要先 train 再 add？

## 九、演进与趋势
IVF 与 GPU、磁盘索引结合支持超大规模；并用学习化聚类提升边界向量召回。

## 十、小结
IVF 用「聚类剪枝」把暴力检索变为近似检索，是 FAISS 提速的核心手段。
