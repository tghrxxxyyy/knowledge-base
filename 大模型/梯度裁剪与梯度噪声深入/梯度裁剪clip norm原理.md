# 梯度裁剪clip norm原理

> 对应 pytorch/pytorch 的 `clip_grad_norm_` 与 d2l-ai/d2l-zh 训练技巧。

## 一、背景与挑战
RNN/Transformer 在长序列上易因梯度连乘出现爆炸，單步更新幅度失控，训练发散。

## 二、核心原理
梯度裁剪把全局梯度范数限制在上界 C 内：若 `||g|| > C` 则 `g ← g·C/||g||`，保持方向不变只缩放到允许的最大步长。

## 三、形式化与数学基础
$ g \leftarrow g \cdot \min\left(1, \frac{C}{\|g\|}\right) $

其中 `||g||` 常用 L2 范数 `√(Σ_i g_i²)`；也可用 L∞（按元素截断）。

## 四、代码实现
```python
import torch
# 在 loss.backward() 之后、opt.step() 之前
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
# 或按元素
torch.nn.utils.clip_grad_value_(model.parameters(), clip_value=1.0)
```

## 五、与其他技术对比
值裁剪（clip value）限制单个元素幅度，可能改变方向；范数裁剪更保方向，是大模型常用方式。

## 六、常见误区
把 max_norm 设得过小会压制有效梯度，训练停滞；设得过大则裁剪形同虚设。

## 七、与开源书/权威来源对应
pytorch/pytorch `torch.nn.utils`；d2l-ai/d2l-zh 第 9 章讲解梯度裁剪。

## 八、面试题
问：范数裁剪改变梯度方向吗？答：不改变，只做等比缩放。

## 九、演进与趋势
自适应裁剪（如按层级或按参数类型）逐渐受关注。

## 十、小结
梯度范数裁剪是大模型稳定训练的基础保险。
