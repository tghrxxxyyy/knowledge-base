# 规范化与正则化canonicalization

> 对应 Lee et al. 2021 "Deduplicating Training Data Makes Language Models Better", NeurIPS 2021。

## 一、背景与挑战

相同语义内容经大小写、空白、标点、Unicode 差异后哈希不同，导致去重漏检。规范化(Canonicalization)在哈希前统一格式以提升比对召回。

## 二、核心原理

对文本做标准化：转小写、统一空白、NFKC 归一化 Unicode、去无关标点，再生成 n-gram 哈希。这样“等价文档”落入同一桶。

## 三、数学形式

规范化函数 $c(\cdot)$ 使：

$$
c(x_1)=c(x_2) \quad \text{当 } x_1,x_2 \text{ 语义等价}
$$

哈希集合：

$$
H(x) = \mathrm{Hash}\big(\mathrm{ngrams}(c(x))\big)
$$

去重判定靠集合相似度(Jaccard)：

$$
J = \frac{|H(x)\cap H(y)|}{|H(x)\cup H(y)|}
$$

## 四、代码实现

```python
import re, unicodedata

def canonicalize(text):
    text = unicodedata.normalize('NFKC', text)
    text = text.lower()
    text = re.sub(r'\s+', ' ', text)
    return text.strip()
```

## 五、与其他对比

未规范化的去重只能捕获字面重复，规范化后可捕获近似重复，但需防过度合并不同内容。

## 六、常见误区

误区：过度归一化(去所有标点)可能合并本质不同文档。

## 七、与开源书对应

- Lee 2021：https://arxiv.org/abs/2107.06499
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Q：规范化解决什么？答：捕获近似重复，提升去重召回。
- Q：风险？答：过度合并可能删掉有用差异文档。

## 九、演进

结合 MinHash/LSH 做近似去重，适应超大规模语料。

## 十、小结

规范化是去重质量的前置关键，需在召回与误并间平衡。
