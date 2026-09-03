# 熵SGD与SGLD

> 对应 Chaudhari et al., *Entropy-SGD*, ICLR 2017；以及 Welling & Teh, *SGLD*, 2011。

## 一、背景与挑战

希望优化器主动寻找宽而平的解，而非恰好停在任意极小值。

## 二、核心原理

Entropy-SGD 在损失上加局部熵项（对该点邻域平均），等效于偏好高局部熵（宽）区域；SGLD 则在 SGD 注入 Langevin 噪声做贝叶斯采样。

## 三、数学形式

熵项 $\mathcal F(\theta)=\mathcal L(\theta)-\gamma T\log\int_\eta e^{-\frac{\|\theta'-\theta\|^2}{2T}}\mathcal L(\theta')$；SGLD 更新 $\theta_{t+1}=\theta_t-\eta\nabla\mathcal L+\sqrt{2\eta T}\xi$。

## 四、代码实现

```python
noise = torch.randn_like(theta) * (2 * lr * T) ** 0.5
theta = theta - lr * grad + noise
```

## 五、与其他对比

- 与 梯度噪声深入 同源（注入噪声）。
- 与 锐度感知深入 都偏好平坦但不机制不同。

## 六、常见误区

- SGLD 需正确退火温度才收敛到后验。
- Entropy-SGD 内层优化成本高。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- SGLD 与 SGD 区别？答：加 Langevin 噪声，使收敛解近似贝叶斯后验采样。

## 九、演进

SGD → SGLD → 预热+循环退火（SGHMC 族）。

## 十、小结

熵SGD/SGLD 通过能量/噪声机制主动偏好宽解，是贝叶斯视角的平坦化。
