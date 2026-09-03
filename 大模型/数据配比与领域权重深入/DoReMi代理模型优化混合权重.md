# DoReMi代理模型优化混合权重

> 对应 Xie et al. 2023 "DoReMi: Optimizing Data Mixtures Speeds Up Language Model Pretraining", NeurIPS 2023。

## 一、背景与挑战

手工调领域权重成本高。DoReMi 用小型代理模型(small proxy)通过分布鲁棒优化自动学习领域权重，再把权重迁移到大模型，大幅缩短搜索成本。

## 二、核心原理

将各域视为“环境”，用 Group DRO 提升最坏域的损失，使权重偏向未被充分学习的域。代理模型训练得到域权重后，直接用于训练更大的目标模型。

## 三、数学形式

Group DRO 目标：

$$
\min_\theta \max_{d} \mathcal{L}_d(\theta)
$$

域权重更新(GDRO)：

$$
q_d^{(t+1)} = q_d^{(t)} \cdot \exp(\eta \cdot \mathcal{L}_d(\theta^{(t)}))
$$

归一化后作为下一步采样权重。最优域权重近似与域大小、模型容量相关。

## 四、代码实现

```python
import torch

def group_dro_update(q, losses, lr=0.01):
    q = q * torch.exp(lr * losses)
    return q / q.sum()
```

## 五、与其他对比

相比经验平滑，DoReMi 自动发现非直觉权重(如大幅提升某些小域)，且可迁移到更大模型。

## 六、常见误区

误区：代理模型权重直接等同目标模型最优。需验证迁移有效性，代理与目标容量差距过大可能失效。

## 七、与开源书对应

- Xie 2023：https://arxiv.org/abs/2305.10429
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Q：DoReMi 为什么用 Group DRO？答：通过对抗最差域，自动补偿欠学习域权重。
- Q：代理模型作用？答：用小成本探索权重，再迁移到大模型省算力。

## 九、演进

在 DoReMi 基础上出现多目标/多任务变体，及与课程退火的联合方法。

## 十、小结

DoReMi 把领域配比变成可优化问题，是数据配比自动化的里程碑。
