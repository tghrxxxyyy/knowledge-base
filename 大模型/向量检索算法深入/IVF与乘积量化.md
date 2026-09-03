# IVF与乘积量化

> 对应 Jégou et al., *Product Quantization*, 2011；Faiss IVF-PQ。

## 一、背景与挑战

全量精确搜索随规模线性慢；需聚类缩小搜索域+量化压缩。

## 二、核心原理

IVF：向量聚成 $n$ 簇，查询只搜最近若干簇（nprobe）。PQ：把向量分 $m$ 段各量化，距离用查表近似。

## 三、数学形式

PQ 距离 $d(x,y)\approx\sum_j d(c_j(x), c_j(y))$ 经码本查表；压缩比 $d\times 4$ 字节→$m$ 字节。

## 四、代码实现

```python
index = faiss.index_factory(d, "IVF1024,PQ64")
index.train(x); index.add(x)
```

## 五、与其他对比

- 省内存（PQ 压缩）但精度略降；HNSW 反之。
- 与 向量数据库选型与调优实战 衔接。

## 六、常见误区

- nprobe 过小漏召回、过大失速。
- PQ 段数 m 与维度不整除致误差大。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- IVF 为何快？答：只搜最近 nprobe 簇，搜索域从全量降到局部。

## 九、演进

IVF → IVF+PQ → GPU-IVF。

## 十、小结

IVF+PQ 以聚类缩域+量化压缩，是大规模向量检索经典组合。
