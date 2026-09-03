# ngram重叠检测方法

> 对应 Lee et al. 2021 "Deduplicating Training Data Makes Language Models Better", NeurIPS 2021。

## 一、背景与挑战

训练集与评测集的 n-gram 重叠会让模型“背答案”而非“学会推理”，造成评测虚高。检测需在大规模语料上高效比对。

## 二、核心原理

将文档切分为 13-gram(经验最优窗口)的滚动哈希集合，若评测样本与训练样本的 n-gram 重叠比例超过阈值，则判定污染。

## 三、数学形式

重叠率：

$$
o(x,y) = \frac{|G_n(x)\cap G_n(y)|}{|G_n(y)|}
$$

其中 $G_n(x)$ 为文档 $x$ 的 n-gram 集合。污染判定：

$$
\mathrm{Contaminated} \iff \exists y\in D_{train}: o(x_{test}, y) \ge \tau
$$

## 四、代码实现

```python
def ngrams(text, n=13):
    toks = text.split()
    return set(tuple(toks[i:i+n]) for i in range(len(toks)-n+1))

def overlap(a, b):
    return len(a & b) / max(1, len(b))
```

## 五、与其他对比

n-gram 简单高效但漏检复述/改写；语义级检测更准但成本高。

## 六、常见误区

误区：只比对完整文档。评测常是片段，需按评测样本窗口比对。

## 七、与开源书对应

- Lee 2021：https://arxiv.org/abs/2107.06499
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Q：为何用 13-gram？答：实验表明该窗口在召回与特异性间最优。
- Q：重叠阈值怎么定？答：依任务，常 0.8 以上判污染。

## 九、演进

从精确 n-gram 到模糊/语义重叠，及与去重流水线集成。

## 十、小结

n-gram 重叠是污染检测的基线方法，简单、可解释、易规模化。
