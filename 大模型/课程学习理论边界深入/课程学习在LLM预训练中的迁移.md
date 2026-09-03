# 课程学习在LLM预训练中的迁移

> 对应 Muennighoff et al. 2023 "Scaling Data-Constrained Language Models", NeurIPS 2023。

## 一、背景与挑战

LLM 预训练数据海量且异质，天然适合“按质量/难度排序”的课程。但排序成本高，且课程对超大规模模型是否仍有效存疑。

## 二、核心原理

实践中常按数据质量(去重、困惑度过滤)而非严格难度排序构造课程。数据受限场景下，重复高质量(更难)样本等价于一种反课程。

## 三、数学形式

数据受限下重复 $r$ 次的加权经验风险近似：

$$
\hat{\mathcal{L}} = \frac{1}{N}\sum_{i=1}^{N} r_i\,\ell_i(\theta), \quad \sum r_i = N_{\text{steps}}
$$

高质量样本被赋予更大 $r_i$，形式上类似课程加权。

## 四、代码实现

```python
def weight_by_quality(scores, epochs_budget):
    import torch
    w = torch.softmax(scores, 0)
    return (w * epochs_budget).round().long()
```

## 五、与其他对比

与经典课程相反，数据受限下“重复难样本”效果更佳，提示大规模预训练的课程逻辑可能反转。

## 六、常见误区

误区：直接套用小模型课程结论到 7B+ 模型；误区：用目标模型困惑度做排序造成泄漏。

## 七、与开源书对应

- Muennighoff 2023：https://arxiv.org/abs/2305.16264
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Q：数据受限时课程学习怎么变？答：重复高质量样本优于单纯加量，类似反课程。
- Q：LLM 预训练如何定义难度？答：常用质量分数、去重后保留度、领域稀有度。

## 九、演进

从质量过滤到基于 DoReMi 的领域权重优化，再到课程式混合退火。

## 十、小结

课程学习在 LLM 预训练中更多以“质量加权/重复”形式出现，需结合数据规模重新审视其边界。
