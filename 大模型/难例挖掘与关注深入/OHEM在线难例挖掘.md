# OHEM在线难例挖掘

> 对应 Shrivastava et al. 2016 "Training Region-based Object Detectors with Online Hard Example Mining", CVPR 2016。

## 一、背景与挑战

两阶段检测中负样本(背景)远多于正样本，随机采样效率低。OHEM 在训练时在线挑选损失最高的样本构成 mini-batch，强化难例学习。

## 二、核心原理

前向计算所有候选 RoI 损失，按损失降序取 Top-K 作为训练样本，其余忽略。仅用这些难例计算梯度，等价于难例硬筛选。

## 三、数学形式

设候选集 $R$，损失 $\ell_i$，硬筛选：

$$
S = \{i\in R : \ell_i \text{ 在 } R \text{ 中排名前 } K\}
$$

mini-batch 损失：

$$
\mathcal{L} = \frac{1}{K}\sum_{i\in S} \ell_i
$$

## 四、代码实现

```python
import torch

def ohem(losses, k):
    if losses.numel() <= k:
        return losses.mean()
    thr = losses.topk(k).values.min()
    mask = losses >= thr
    return losses[mask].mean()
```

## 五、与其他对比

OHEM 是“硬”筛选(非0即1)，Focal Loss 是“软”加权；OHEM 实现简单但引入额外前向开销。

## 六、常见误区

误区：Top-K 固定比例。难例比例应随训练阶段动态调整。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- Shrivastava 2016：https://arxiv.org/abs/1604.03540

## 八、面试题

- Q：OHEM 与 Focal Loss 区别？答：硬筛选 vs 软加权；OHEM 双前向、FL 单前向。
- Q：OHEM 开销？答：需额外前向算全部损失再筛选。

## 九、演进

从检测扩展到分类难例挖掘，及与课程学习结合的“渐进难例暴露”。

## 十、小结

OHEM 以在线硬筛选聚焦难例，是难例挖掘的硬范式代表。
