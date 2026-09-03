# SGD噪声与泛化

> 对应 Smith & Le, 2017（SGD 作为带温度采样的贝叶斯推断）。

## 一、背景与挑战

如何把 SGD 噪声与贝叶斯后验采样联系起来，从而解释泛化。

## 二、核心原理

在连续时间下 SGD 近似采样自温度 $T\sim\gamma$ 的后验；退火（降 LR）使分布收窄到极小值。

## 三、数学形式

Fokker-Planck 对应：$\partial_t p=D\nabla\cdot(p\nabla\mathcal L)+D\nabla^2 p$，$D=\frac{\eta\epsilon}{2B}$ 为扩散系数。

## 四、代码实现

```python
# 理论检验：调 batch/LR 改变扩散系数 D
D = lr * eps_var / (2 * B)
```

## 五、与其他对比

- 与 熵SGD与SGLD 的 Langevin 视角一致。
- 与 自适应学习率深入（LR 调度）关联。

## 六、常见误区

- 以为增大噪声总提升泛化，过量破坏收敛。
- 忽略数据方差 $\epsilon$ 本身随分布变化。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- SGD 与贝叶斯采样关系？答：连续时间下 SGD 近似 Langevin 采样，噪声温度由批量与 LR 决定。

## 九、演进

启发式 → SDE 理论 → 学习率退火连接。

## 十、小结

SGD 噪声在理论上是后验采样，为泛化提供贝叶斯解释。
