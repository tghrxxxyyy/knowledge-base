# RetNet与保持性

> 对应 Sun et al., 2023 *Retentive Network: A Successor to Transformer for Large Language Models*。

## 一、背景与挑战
Transformer 在长序列上推理贵（KV Cache 线性增长），RNN 训练无法并行。RetNet 提出保持性机制（retention），统一并行训练与循环推理。

## 二、核心原理
引入衰减 $\gamma \in (0,1)$ 与因果掩码 $M$（下三角），状态递推 $S_t = \gamma S_{t-1} + k_t v_t^\top$，输出 $o_t = q_t^\top S_t$。训练时展开为并行形式 $O = (Q \odot \Gamma)(K^\top V)$，$\Gamma$ 是 $\gamma^{i-j}$ 的掩码。

## 三、形式化与数学基础
并行形式：$ \text{Retention}(Q,K,V) = (Q \odot \Theta)(K^\top V) $，$\Theta_{ij} = \gamma^{i-j}$（$i \ge j$）否则 $0$。等价于逐头 ROPE 后做 $\gamma$ 加权 softmax。

## 四、代码实现
```python
# 并行 retention
gamma = 0.9
i = torch.arange(L); j = torch.arange(L)
mask = (i[:,None] >= j[None,:]).float()
gamma_pow = gamma ** (i[:,None] - j[None,:]) * mask
out = (Q * gamma_pow) @ (K.transpose(-1,-2) @ V)
```

## 五、与其他技术对比
- vs Transformer：推理 $O(1)$ 每步 vs $O(L)$；训练并行性等价。
- vs Mamba：两者都线性，但 retention 是显式衰减，SSM 是连续化参数。

## 六、常见误区
- 误以为 retention 完全没有注意力矩阵；并行训练仍需要完整 $L \times L$ 计算（只是 $\gamma$ 加权）。
- $\gamma$ 太小致早期信息被过度衰减，模型退化为短时记忆。

## 七、与开源书/权威来源对应
- microsoft/torchscale 中 RetNet 实现。
- d2l-ai/d2l-zh 关于序列建模的章节。

## 八、面试题
- RetNet 如何统一训练与推理？答：训练展开为并行 retention，推理用递推 $S_t$，二者数学等价。

## 九、演进与趋势
Transformer → Retention（RetNet）→ Mamba（SSM）→ 混合架构（如 Jamba）。

## 十、小结
RetNet 用保持性机制为线性注意力增加了显式衰减控制，是兼顾训练并行与推理常数复杂度的代表方案。
