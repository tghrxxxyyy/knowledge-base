# Softmax 与温度

> 对应 d2l-zh；Hinton et al., *Distilling*, 2015（温度蒸馏）。

## 一、背景与挑战

softmax 把分数转概率；温度控制分布的「锐/钝」，影响训练与生成。

## 二、核心原理

带温度 softmax：
```
p_i = exp(z_i/τ) / Σ_j exp(z_j/τ)
```
τ→0 近似 one-hot（更确定）；τ→∞ 趋均匀（更平滑）。训练中 τ=1；生成采样可调节（见采样章节）；蒸馏用高 τ 暴露软标签信息。

## 三、数学形式

见上；τ 即温度超参。

## 四、代码实现

```python
logits = logits / temperature
probs = F.softmax(logits, -1)
```

## 五、关键要点

- τ>1 平滑，利于蒸馏与探索。
- 生成时 τ 低更确定、高更发散。
- 注意力中的 √d_k 本质也是一种温度缩放。

## 六、与其他对比

- 硬 argmax 无概率；softmax 有置信度。

## 七、常见误区

- 温度=学习率——两者无关。

## 八、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- Hinton et al., 2015 蒸馏论文。

## 九、面试题

- 温度在蒸馏中的作用？

## 十、演进

softmax → 温度缩放 → 校准温度。

## 十一、小结

温度是「确定性旋钮」。
