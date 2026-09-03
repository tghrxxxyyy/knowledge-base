# Query-by-Committee与一致性采样

> 对应 Seung et al. 1992 "Query by Committee", COLT 1992。

## 一、背景与挑战

单模型不确定性忽略了模型族内的分歧。Query-by-Committee(QBC)用一组模型委员会，挑选委员会最“不一致”的样本，理论上能更快缩小版本空间(version space)。

## 二、核心原理

委员会由多个假设 $h_1,\dots,h_C$ 构成，对样本 $x$ 的投票产生类分布 $\hat{p}(k)=\frac{1}{C}\sum_c \mathbb{1}\{h_c(x)=k\}$。以投票熵衡量分歧。

## 三、数学形式

投票熵：

$$
H_{vote}(x) = -\sum_k \hat{p}(k)\log \hat{p}(k)
$$

KL 散度(consensus): 各委员分布 $p_c$ 与平均 $\bar{p}$ 的平均 KL：

$$
\mathbb{E}_c[\mathrm{KL}(p_c\parallel \bar{p})]
$$

## 四、代码实现

```python
import torch

def vote_entropy(preds):  # preds: [C, B, K]
    avg = preds.mean(0)
    return -(avg * avg.log()).sum(-1)
```

## 五、与其他对比

QBC 利用多模型分歧，比单模型不确定性更可靠，但计算成本高(需训练多个模型)。

## 六、常见误区

误区：委员差异仅来自随机初始化即可。实际上需足够多样性(不同结构/数据子集)才有效。

## 七、与开源书对应

- Settles 2009：https://www.biostat.wisc.edu/~craven/SLS/settles.activelearning.pdf
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Q：QBC 理论依据？答：通过最大化委员会分歧最快缩小版本空间。
- Q：如何降低 QBC 成本？答：用 dropout 近似集成或历史快照作委员。

## 九、演进

现代用模型不同 checkpoint 或 LoRA 多适配作为委员，在 LLM 数据筛选中复用。

## 十、小结

QBC 以更高成本换取更一致的样本选择，是分歧度量的经典范式。
