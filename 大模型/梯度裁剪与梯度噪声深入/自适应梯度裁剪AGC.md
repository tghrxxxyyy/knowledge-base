# 自适应梯度裁剪AGC

> 对应 pytorch/pytorch 梯度工具与 d2l-ai/d2l-zh 归一化思想。

## 一、背景与挑战
全局固定 max_norm 对不同层、不同参数尺度不公平：小参数易被过度压缩，大参数仍可能爆炸。

## 二、核心原理
AGC 按参数自身范数对梯度做相对裁剪：`g ← g·min(1, λ·||θ||/||g||)`，使相对步长一致，适配不同尺度参数。

## 三、形式化与数学基础
$ g_i \leftarrow g_i \cdot \min\left(1, \lambda \frac{\| \theta_i \|}{\|g_i\|}\right) $

λ 通常取 0.01~0.1，控制相对更新比例。

## 四、代码实现
```python
def agc(params, lambda_clip=0.01):
    for p in params:
        if p.grad is None:
            continue
        p_norm = p.norm(2)
        g_norm = p.grad.norm(2)
        if p_norm > 0 and g_norm > 0:
            scale = min(1.0, lambda_clip * p_norm / g_norm)
            p.grad.mul_(scale)
```

## 五、与其他技术对比
全局裁剪平等对待所有梯度；AGC 按参数尺度自适应，对含不同量级权重的模型更友好。

## 六、常见误区
对所有参数（含 bias）同样施加 AGC 可能抑制必要更新，实践中常跳过小型参数。

## 七、与开源书/权威来源对应
d2l-ai/d2l-zh 阐述按层归一化思想；pytorch/pytorch 提供基础裁剪原语可据此扩展。

## 八、面试题
问：AGC 相对全局裁剪的优势？答：按参数尺度归一，避免小权重被压制。

## 九、演进与趋势
与归一化、初始化协同的自适应裁剪是研究热点。

## 十、小结
自适应裁剪在异构参数尺度场景下更稳健。
