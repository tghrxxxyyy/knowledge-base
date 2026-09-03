# 后缀数组与MinHash

> 对应 Broder, *MinHash*, 1997（集合近似相似）；Lee et al., 2022（MinHash 加速去重）；Wenzek et al., *CCNet*, 2020。

## 一、背景与挑战

$n$-gram 两两比较是 $O(N^2)$，亿级文档不可行；需用局部敏感哈希把相似文档高概率分桶。

## 二、核心原理

MinHash：对文档指纹集合用 $k$ 个独立哈希函数，取每函数最小值构成签名；签名相等概率正比于 Jaccard。再用 LSH 分桶，只在同桶内比较。

## 三、数学形式

对任意哈希 $h$，有 $P(\min_{x\in S}h(x)=\min_{y\in T}h(y))=J(S,T)$；签名距离用 $\hat J=\frac1k\sum\mathbb I(h_i(S)=h_i(T))$。

## 四、代码实现

```python
import hashlib
def minhash(sigs, doc, k=128):
    fps = set(doc)
    return tuple(min(h(fp) for fp in fps) for h in sigs[:k])
```

## 五、与其他对比

- 比精确 $n$-gram 重叠快几个数量级，适合全网去重。
- 与 多语种分词与挑战深入（指纹需先分词）依赖。

## 六、常见误区

- 哈希函数数 $k$ 过小近似误差大、过大耗时。
- LSH 分桶数/带宽设错致漏桶。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- MinHash 为何能估 Jaccard？答：两集合最小哈希相等的概率恰等于 Jaccard 相似度。

## 九、演进

两两比较 → MinHash → MinHash+LSH → 稠密嵌入去重。

## 十、小结

MinHash+LSH 是大规模近似去重工程标配，以概率分桶换速度。
