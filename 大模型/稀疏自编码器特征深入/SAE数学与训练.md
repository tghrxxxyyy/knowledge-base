# SAE数学与训练

> 对应 Cunningham et al., ICLR 2024；及开源实现（SAELens）。

## 一、背景与挑战

训练稳定、特征不死的 SAE 需要仔细设计正则与初始化。

## 二、核心原理

常用 ReLU/JumpReLU 编码；字典维度取激活维数数倍至数十倍；用 L1 或熵正则控平均活数；需避免死特征（长期不激活）与重构塌缩。

## 三、数学形式

JumpReLU 编码 $f_i = \Theta(W_{enc,i}\cdot x - \theta_i)\,(W_{enc,i}\cdot x)$，阈值 $\theta$ 可学习，更稳。

## 四、代码实现

```python
def jumprelu(z, theta):
    return (z > theta).float() * z
f = jumprelu(Wenc @ x + be, theta)
```

## 五、与其他对比

- 与 稀疏自编码器总览 衔接（实现细节）。
- 与 规模与可解释性关系深入（规模影响字典大小）相关。

## 六、常见误区

- 太强 L1 致死特征；太弱则多义残留。
- 忽视字典维度对计算成本的影响。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 如何防死特征？答：用 JumpReLU/可逆阈值、重采样死特征、调整 L1 与学习率。

## 九、演进

ReLU SAE → JumpReLU → 批量拓扑/分层 SAE。

## 十、小结

SAE 训练是稀疏度与重建的权衡工程，稳定性靠正则设计。
