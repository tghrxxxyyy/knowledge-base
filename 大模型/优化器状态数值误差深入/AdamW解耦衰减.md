# AdamW 与解耦权重衰减

> 对应 Loshchilov & Hutter, 2019（AdamW 解耦权重衰减）。

## 一、背景与挑战

标准 Adam 把 L2 正则加进梯度，再被二阶矩缩放，导致有效衰减强度依赖梯度尺度，不可控。

AdamW 把权重衰减从梯度中解耦，直接作用于参数，语义清晰、数值更稳。

## 二、核心原理

AdamW：$w\leftarrow w-\eta(\hat m_t/(\sqrt{\hat v_t}+\epsilon)+\lambda w)$，衰减项 $\lambda w$ 不经自适应缩放。

这使衰减强度只与 $\eta\lambda$ 有关，独立于梯度幅值，便于调参且更稳。

## 三、数学形式

更新：$w_{t+1}=w_t-\eta\left(\frac{\hat m_t}{\sqrt{\hat v_t}+\epsilon}+\lambda w_t\right)$；与 Adam+L2 的区别在 $\lambda w_t$ 位置。

## 四、代码实现

```python
opt = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=0.1)
```

## 五、与其他对比

- 与 优化器数值总览 衔接，衰减实现影响轨迹。
- 与 一阶动量数值 互补，衰减叠加在动量步上。
- 与 训练发散诊断与恢复深入 相关，过大 $\lambda$ 致权重塌缩。

## 六、常见误区

- 把 AdamW 的 weight_decay 当 L2（语义不同）。
- decay 过大使权重过早塌到 0。
- 未对 bias/LN 缩放参数屏蔽 decay。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- AdamW 为何比 Adam+L2 好？答：衰减解耦后强度不依赖梯度尺度，可控且稳。
- 权重衰减过大会怎样？答：权重塌缩、欠拟合甚至数值异常。

## 九、演进

Adam+L2 → AdamW 解耦 → 分层/自适应衰减。

## 十、小结

AdamW 以解耦衰减提供可控正则，是现代 LLM 训练默认优化器。
