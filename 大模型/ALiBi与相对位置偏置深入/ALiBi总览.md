# ALiBi总览

> 对应 Press et al., 2022 *Train Short, Test Long: Attention with Linear Biases Enables Input Length Extrapolation*。

## 一、背景与挑战
Transformer 在训练长度之外性能急剧下降。ALiBi 用加性线性偏置替代或叠加位置编码，无需修改模型即可外推到更长序列。

## 二、核心原理
在注意力分数上加 $-m \cdot |i-j|$，其中 $m$ 是固定斜率，按头设定（几何序列如 $1/2^1, 1/2^2, \dots$）。最近邻最强，长距离被强烈抑制。

## 三、形式化与数学基础
$ \text{score}_{ij} = q_i^\top k_j - m \cdot |i-j| $。$m$ 取 $2^{-8/n}$ 的几何序列（$n$ 头数），保证斜率分布合理。softmax 后的权重随 $|i-j|$ 增大近似指数衰减。

## 四、代码实现
```python
# ALiBi 偏置
slopes = torch.tensor([2**(-8/i) for i in range(1, n_heads+1)])
dist = (torch.arange(L)[:,None] - torch.arange(L)[None,:]).abs().float()
bias = -slopes[:,None,None] * dist[None,:,:]
attn = (q @ k.transpose(-1,-2) + bias).softmax(-1)
```

## 五、与其他技术对比
- vs 绝对位置编码：ALiBi 加性且无参数，训练短测试长。
- vs RoPE：ALiBi 无需修改 Q/K，但表达力弱于 RoPE。

## 六、常见误区
- 斜率设置不当（如全部相同）致所有头行为一致。
- 训练时把 ALiBi 当作可学习参数（它本应是固定的）。

## 七、与开源书/权威来源对应
- ofwfanfan/ALiBi 原始实现。
- huggingface/transformers `models/bloom` 中 ALiBi。

## 八、面试题
- ALiBi 为什么能外推？答：偏置 $-m|i-j|$ 不依赖训练长度，长距离衰减是单调的。

## 九、演进与趋势
绝对位置 → 正弦 → ALiBi → RoPE+ALiBi 混合（BLOOMZ）。

## 十、小结
ALiBi 用简单加性偏置实现长度外推，是 BLOOM 等模型的选择。
