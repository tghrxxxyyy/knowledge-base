# ALiBi 深入

> 对应 Press et al. (2022) Train Short, Test Long: Attention with Linear Biases Enables Input Length Extrapolation (ALiBi)。

## 一、背景与挑战

Transformer 的位置编码长期面临「长度外推」难题：用可学习绝对位置训练于长度 $L$，推理遇到更长序列时位置向量越界，性能骤降。正弦编码虽可外推但有限，RoPE 需调参。许多场景（长文档、检索）要求训练短、推理长。

ALiBi（Attention with Linear Biases）另辟蹊径：**完全不注入位置向量**，改为在注意力分数上直接加一个与相对距离线性成反比的偏置，使模型天然具备任意长度外推能力，且省去位置嵌入参数。

## 二、核心原理

ALiBi 的关键设计：

1. **无位置嵌入**：输入不加大任何位置向量，仅用 token 内容。
2. **线性偏置**：对每个注意力头 $h$，在 query-key 点积分数上减去一个与距离成正比的偏置：

$$
\text{score}_{h}(i,j) = q_i^\top k_j - m_h \cdot (i-j)
$$

其中 $i$ 为 query 位置、$j$ 为 key 位置、$m_h>0$ 为该头专属斜率。
3. **斜率分配**：不同头用几何递减的斜率（如 $2^{-r}$），让部分头关注近距、部分头关注远距，形成多尺度偏置。
4. **外推即天然**：因偏置只依赖距离 $(i-j)$，推理长度超出训练长度时公式仍成立。

## 三、形式化与数学基础

完整注意力（softmax）为：

$$
a_{ij} = \frac{\exp\big(q_i^\top k_j / \sqrt{d} - m_h(i-j)\big)}{\sum_{j'} \exp\big(q_{i'}^\top k_{j'} / \sqrt{d} - m_h(i'-j')\big)}
$$

偏置项 $-m_h(i-j)$ 随距离线性增大负向惩罚，等价于对远距离 key 施加指数衰减的「门」。斜率集合常取：

$$
m_h = 2^{-2^{-(h-1)/\lceil H/2\rceil}},\quad h=1,\dots,H
$$

使头间斜率跨多个数量级，覆盖近/远不同感受野。该偏置不依赖绝对位置索引，故无「越界」问题。

## 四、代码实现

ALiBi 偏置矩阵的构造：

```python
import torch

def alibi_bias(heads, seq_len, device="cuda"):
    # 每头斜率：几何递减
    powers = torch.arange(1, heads + 1, device=device)
    slopes = 2.0 ** (-2.0 ** -(powers / (heads // 2)))
    # 距离矩阵：(i-j)
    idx = torch.arange(seq_len, device=device)
    dist = idx[:, None] - idx[None, :]      # (seq, seq)
    bias = slopes[:, None, None] * dist      # (H, seq, seq)
    return -bias                            # 减号施加惩罚
```

注意力计算时 `scores = scores + bias`（已含负号）。

## 五、与其他技术对比

| 编码 | 位置嵌入 | 外推 | 参数 | 训练长文本需求 |
|------|----------|------|------|----------------|
| 可学习绝对 | 是 | 弱 | 有 | 需 |
| 正弦绝对 | 否(固定) | 有限 | 无 | 需 |
| RoPE | 否(旋转) | 强(调参) | 无 | 可 |
| ALiBi | 否 | 强(无需调) | 无 | 不需 |

## 六、常见误区

- **「位置信息靠嵌入注入」**：ALiBi 证明偏置也能编码顺序，且更利外推。
- **「斜率可随意设」**：头间多尺度斜率是性能关键，需覆盖广范围。
- **「ALiBi 与 RoPE 正交」**：二者可组合（如某些模型叠加），但纯 ALiBi 已够外推。
- **混淆偏置与 mask**：ALiBi 偏置是软性距离惩罚，不同于因果 mask 的硬截断。

## 七、与开源书·权威来源对应

- Press et al., *Train Short, Test Long: Attention with Linear Biases...*, 2022（ICLR）。
- HuggingFace Transformers 的 ALiBi 实现（如 BLOOM、MPT 采用变体）。
- Vaswani et al., *Attention Is All You Need*, 2017（位置编码起点）。

## 八、面试题

1. ALiBi 为何无需位置嵌入即可外推？
2. 斜率 $m_h$ 为何要在不同头取不同值（多尺度）？
3. ALiBi 偏置与因果掩码有何区别？
4. ALiBi 相比 RoPE 在外推上的优劣？

## 九、演进与趋势

ALiBi 影响了 MPT、BLOOM 等支持长上下文的模型。后续「旋转 + 线性偏置」混合、以及位置插值（NTK/PI）与 ALiBi 思路交叉，成为「训练短、测试长」家族的重要一支。趋势是把外推能力作为架构默认属性而非后处理。

## 十、小结

ALiBi 用「无位置嵌入 + 线性距离偏置」以极简方式实现天然长度外推，省参数且训练短推理长。其多尺度头斜率设计是核心，是当前长上下文两大路线（ALiBi vs RoPE+NTK）之一。
