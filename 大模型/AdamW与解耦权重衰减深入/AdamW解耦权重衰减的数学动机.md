# AdamW解耦权重衰减的数学动机

> 对应 Loshchilov & Hutter 2019 AdamW (arXiv:1711.05101)。

## 一、背景与挑战
标准 Adam 优化器把 L2 正则项直接写进目标函数，再参与自适应二阶矩的归一化。这种耦合导致权重衰减被梯度的尺度与二阶矩历史污染，衰减强度随参数幅度与更新幅度漂移，难以稳定控制模型的复杂度偏好。

## 二、核心原理
AdamW 的关键思想是解耦：把权重衰减从损失梯度中剥离，单独以固定比例作用于参数本身，而不是混入自适应更新。这样衰减强度只由系数 λ 与学习率 η 决定，与梯度幅值无关，调参更直观。

## 三、形式化与数学基础
经典带 L2 的 Adam 近似为：

$ \theta_{t+1} = \theta_t - \eta \cdot \hat m_t / (\sqrt{\hat v_t} + \epsilon) - \eta \lambda \theta_t $

AdamW 将其改为：

$ \theta_{t+1} = \theta_t - \eta \cdot \hat m_t / (\sqrt{\hat v_t} + \epsilon) - \eta \lambda \theta_t $

区别在于 λθ_t 这一项不再经过 m_t、v_t 的归一化，而是直接作用在参数上。最终更新可写为：

$ \theta_{t+1} = (1 - \eta \lambda) \theta_t - \eta \cdot \hat m_t / (\sqrt{\hat v_t} + \epsilon) $

## 四、代码实现
```python
# 伪代码：解耦权重衰减
def adamw_step(p, g, m, v, t, lr, beta1, beta2, eps, wd):
    m[:] = beta1 * m + (1 - beta1) * g          # 一阶矩
    v[:] = beta2 * v + (1 - beta2) * (g * g)    # 二阶矩
    mhat = m / (1 - beta1 ** t)                 # 偏差校正
    vhat = v / (1 - beta2 ** t)
    p *= (1 - lr * wd)                          # 解耦衰减
    p -= lr * mhat / (vhat.sqrt() + eps)        # 自适应更新
```

## 五、与其他技术对比
普通 SGD 的权重衰减等价于 L2 正则，因为 SGD 更新是线性的；但 Adam 的非线性自适应使两者不等价。AdamW 恢复了衰减的可解释性，在相同 λ 下通常获得更好的泛化与更优的验证损失。

## 六、常见误区
误以为 `weight_decay` 在 Adam 与 SGD 中含义相同。PyTorch 在 `optim.Adam` 旧实现里把 decay 当成 L2 项，直至 `AdamW` 类才真正解耦。另一个误区是给 bias 与 LayerNorm 也施加大衰减，通常应将这些参数排除。

## 七、与开源书/权威来源对应
Loshchilov & Hutter 2019 AdamW (arXiv:1711.05101)。实现参考 pytorch/pytorch 的 `torch.optim.AdamW` 与 karpathy/nanoGPT 的优化器配置。

## 八、面试题
问：为什么 Adam 中 L2 正则与权重衰减不等价？答：因为自适应归一化使更新对梯度幅度非线性，衰减项被 m_t/v_t 缩放，破坏等价性。

## 九、演进与趋势
AdamW 已成为大模型预训练的事实标准，后续 Lion、Adan 等也在解耦范式上演进，权重衰减与学习率的耦合关系仍是研究重点。

## 十、小结
解耦衰减让系数 λ 直接控制参数收缩速度，显著提升调参可解释性与泛化，是大模型优化栈的基石组件。
