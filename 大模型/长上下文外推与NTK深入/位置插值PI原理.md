# 位置插值PI原理

> 对应 Chen et al., 2023 *Extending Context Window of Large Language Models via Positional Interpolation*。

## 一、背景与挑战
RoPE 在训练长度 $L_\text{train}$ 内有效，超出后内积进入未训练区域。PI 通过缩放位置 $m$ 强行把超长位置映射回训练区间。

## 二、核心原理
设 $s = L_\text{target}/L_\text{train}$，把 $m$ 替换为 $m/s$。所有 RoPE 频率 $\theta$ 不变，仅位置坐标缩放。等价于把 $L$ 维位置向量扩展到 $L/s$ 维空间。

## 三、形式化与数学基础
RoPE 内积 $\cos((m-n)\theta)$ 变为 $\cos((m-n)\theta/s)$。当 $s$ 较大时，相邻位置的内积变化更小，需要模型重新学习。但 $s$ 太大时梯度信号过弱。

## 四、代码实现
```python
# LLaMA 风格 PI
def get_inv_freq(dim, s, base=10000):
    return 1.0 / (base ** (torch.arange(0, dim, 2).float() / dim)) / s
```

## 五、与其他技术对比
- vs NTK：PI 等比缩放所有频率，NTK 仅缩低频。
- vs 训练时长：PI 无需训练即可用，但效果依赖微调。

## 六、常见误区
- $s$ 太大时模型需较多微调数据。
- 推理时 $m/s$ 可能不是整数。

## 七、与开源书/权威来源对应
- meta-llama/llama 仓库 PI 实现。
- d2l-ai/d2l-zh。

## 八、面试题
- PI 的局限性？答：高频也被压缩，模型需重新学习短程关系。

## 九、演进与趋势
PI → NTK → YaRN。

## 十、小结
PI 是最简单但效果有限的位置外推方案。
