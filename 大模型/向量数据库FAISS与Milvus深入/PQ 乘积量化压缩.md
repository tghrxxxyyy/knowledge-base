# PQ 乘积量化压缩

> 对应 facebookresearch/faiss 的 IndexPQ 与 facebookresearch/faiss 量化实现。

## 一、背景与挑战
海量高精度向量内存昂贵。乘积量化（PQ）把高维向量切成子段，各子段独立聚类为小码本，用短码表示向量，将内存降至原来的数十分之一。

## 二、核心原理
将 d 维向量分为 m 段，每段用 k-means 量化为 b 比特码（如 8 比特=256 中心）。向量用 m 个码字表示，距离通过查表（各段到查询段的距离表）快速近似计算。

## 三、形式化与数学基础
向量 $x = [x^1,\dots,x^m]$，量化 $q(x^i) \in \{0,\dots,2^b-1\}$。近似距离：
$\|x-y\|^2 \approx \sum_{i=1}^{m} \|x^i - c^i_{q(y^i)}\|^2 = \sum_{i} T_i[q(y^i)]$
其中 $T_i$ 为第 i 段的距离查表，避免重复计算。

## 四、代码实现
```python
import faiss
index = faiss.IndexPQ(128, 8, 8)   # dim, m=8段, bits=8
index.train(data)
index.add(data)
D, I = index.search(q, 10)          # 压缩后近似检索
```

## 五、与其他技术对比
相比 Flat，PQ 极大省内存但引入量化误差；相比 IVF，PQ 是压缩而非剪枝，常与 IVF 组合（IVF+PQ）。适合内存受限的十亿级场景。

## 六、常见误区
误区一：m 与 bits 任意，过大码本内存反升、过小精度崩。误区二：认为 PQ 距离等于真实距离，实为近似。

## 七、与开源书/权威来源对应
- facebookresearch/faiss 的 ProductQuantizer 实现。
- pytorch/pytorch 可用于预计算。
- facebookresearch/faiss 索引组合文档。

## 八、面试题
1. PQ 如何把内存降为 1/m？
2. 距离查表为何加速？
3. IVF+PQ 各自解决什么问题？

## 九、演进与趋势
OPQ（旋转优化 PQ）与加性量化进一步降误差，并结合 GPU 量化推理。

## 十、小结
PQ 用分段量化把向量压缩到极致，是超大规模检索的内存解药。
