# 课程学习基本假设与Bengio2009原始框架

> 对应 Bengio et al. 2009 "Curriculum Learning", ICML 2009。

## 一、背景与挑战

传统经验风险最小化把训练样本视为独立同分布，然而人类学习遵循由易到难的顺序。Bengio 等人提出课程学习(Curriculum Learning)：先用“简单”样本训练，再逐步引入“困难”样本，可加速收敛并提升泛化。挑战在于：(1) 如何定义样本难度；(2) 课程是否对所有任务都有效；(3) 课程调度与优化动力学之间的关系。

## 二、核心原理

课程学习的核心是一个难度排序函数 $\rho(x)$ 与一个从易到难的课程调度 $w(t)\in[0,1]$。在训练步 $t$，仅使用难度低于阈值 $\lambda(t)$ 的样本，且 $\lambda(t)$ 随 $t$ 单调递增。其直觉来源于非凸优化：简单样本提供平滑的梯度方向，帮助优化器跳出较差的局部极小。

## 三、数学形式

设数据按难度排序 $x_1\prec x_2\prec\cdots\prec x_n$，课程权重为：

$$
w_i(t) = \sigma\left(\frac{\lambda(t) - \rho(x_i)}{\tau}\right)
$$

其中 $\sigma$ 为 sigmoid，$\tau$ 控制过渡锐度。加权经验风险为：

$$
\mathcal{L}(t) = \sum_{i=1}^{n} w_i(t)\,\ell(f_\theta(x_i), y_i)
$$

Bengio 实验表明，在语言建模与几何形状识别上，课程学习能减少 30%~50% 的迭代次数。

## 四、代码实现

```python
import torch, math

def curriculum_weight(difficulty, lam, tau=1.0):
    return torch.sigmoid((lam - difficulty) / tau)

def step_lambda(epoch, total, dmin, dmax):
    return dmin + (dmax - dmin) * (epoch / total)
```

## 五、与其他对比

与自步学习(Self-Paced Learning)不同，课程学习的难度阈值由外部预先指定；自步学习则根据模型当前损失自适应决定“自己能学会哪些样本”。课程学习更像“教师排课”，自步学习更像“学生自选”。

## 六、常见误区

误区一：认为课程一定优于随机顺序。实际上对凸问题或样本难度区分不明显的任务，课程可能无益甚至有害。误区二：把“难度”等同于“损失”，忽略了难度应是样本固有属性而非模型相关量。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- Bengio 2009：https://dl.acm.org/doi/10.1145/1553374.1553380

## 八、面试题

- Q：课程学习为什么有时反而有害？答：当“简单样本”携带的归纳偏置与真实分布不一致，或难度排序错误时，会引导优化器进入错误 basin。
- Q：课程学习与迁移学习的关系？答：Weinshall 2018 用预训练网络定义难度，可视为课程学习+迁移的结合。

## 九、演进

从固定课程到自步学习(Kumar 2010)、反课程(anti-curriculum)、以及 2020 年后的自动课程(如基于强化学习调度)。LLM 预训练中也出现按数据质量/困惑度排序的课程。

## 十、小结

课程学习的有效性高度依赖难度度量的正确性与任务结构。它并非万能加速器，而是一种需要精心设计的训练偏置。
