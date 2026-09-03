# 自步学习SPL的收剑性与加权机制

> 对应 Kumar et al. 2010 "Self-Paced Learning for Latent Variable Models", NeurIPS 2010。

## 一、背景与挑战

课程学习需人工指定难度，难以推广。自步学习(Self-Paced Learning, SPL)让模型自行决定学习速度：先用简单样本热身，逐渐纳入更难但模型已具备一定判别力的样本。挑战是理论收敛性证明与超参敏感性。

## 二、核心原理

SPL 在经验风险上加一个由“年龄”参数 $v$ 控制的样本选择正则。目标变为：

$$
\min_{\theta, w} \sum_i w_i \ell_i(\theta) - v \sum_i w_i, \quad w_i \in \{0,1\}
$$

其中 $w_i$ 指示是否纳入样本，$v$ 越大越“自信”、纳入越多样本。

## 三、数学形式

对二值变量 $w_i$ 求解析解可得：

$$
w_i^\star = \mathbb{1}\{\ell_i(\theta) < v\}
$$

即仅保留损失低于阈值 $v$ 的样本。随训练推进逐步增大 $v$，等效于课程由易到难。$v$ 的调度满足 $v_t = v_0 (1 + t/T)^\gamma$。

## 四、代码实现

```python
import torch

def spl_select(losses, v):
    return (losses < v).float()

def anneal_v(t, T, v0=1.0, gamma=1.0):
    return v0 * (1.0 + t / T) ** gamma
```

## 五、与其他对比

SPL 与课程学习的区别在于难度由模型损失动态决定而非外部给定。与硬负挖掘相比，SPL 作用于整个训练集而非仅困难样本。

## 六、常见误区

误区：把 $v$ 固定不变。固定 $v$ 退化为简单阈值筛选，失去“自步”渐进特性。另一误区是忽视 $v$ 增长过快导致初期梯度爆炸。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：SPL 中 $v$ 的物理含义？答：模型当前的“学习容量/信心”，决定是否接纳更难样本。
- Q：SPL 与课程学习谁更通用？答：SPL 无需预定义难度，更通用但需谨慎调度 $v$。

## 九、演进

后续提出自步学习与协同训练结合(SPL-Co)、带正则的自步、以及可微自步(用连续 $w_i\in[0,1]$ 替代二值)。

## 十、小结

SPL 通过自适应样本选择实现“隐式课程”，其收敛性在温和假设下可证，是课程学习理论边界的重要补充。
