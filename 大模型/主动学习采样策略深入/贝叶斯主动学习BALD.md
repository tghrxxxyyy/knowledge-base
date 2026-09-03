# 贝叶斯主动学习BALD

> 对应 Hounsby et al. 2011 "Bayesian Active Learning for Classification and Preference Learning", UAI 2011。

## 一、背景与挑战

贝叶斯视角下，模型参数是分布而非点估计。BALD(Bayesian Active Learning by Disagreement)挑选“对模型参数最不确定、但对预测最确定”的样本，平衡探索与利用。

## 二、核心原理

BALD 最大化互信息：模型输出 $y$ 与参数 $\omega$ 关于输入 $x$ 的互信息，等价于预测熵减去期望参数熵。

## 三、数学形式

$$
I(y;\omega\mid x) = H(y\mid x) - \mathbb{E}_{p(\omega)}[H(y\mid x,\omega)]
$$

直观：第一项大(预测不确定)、第二项小(各参数下预测一致)的样本信息量最高。

## 四、代码实现

```python
import torch

def bald(preds):  # preds: [M, B, K] M 个 posterior samples
    exp_ent = -(preds.mean(0) * preds.mean(0).log()).sum(-1)
    ent_exp = -(preds * preds.log()).sum(-1).mean(0)
    return exp_ent - ent_exp
```

## 五、与其他对比

BALD 比普通熵采样更倾向“能改变模型信念”的样本，避免重复标注同类样本。

## 六、常见误区

误区：用单次 dropout 近似后向方差不足。需足够 MC 样本保证互信息估计稳定。

## 七、与开源书对应

- Hounsby 2011：https://arxiv.org/abs/1112.5745
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Q：BALD 与普通熵区别？答：BALD 最大化输出与参数的互信息，关注“能改变信念”的样本。
- Q：BALD 在 LLM 中怎么用？答：用多 checkpoint/多 decode 近似 posterior 选数据。

## 九、演进

BALD 扩展到批次选择(BatchBALD)，避免同批样本冗余。

## 十、小结

BALD 提供信息论严谨的采集函数，是主动学习的黄金标准之一。
