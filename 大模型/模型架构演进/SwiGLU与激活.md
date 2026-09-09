# SwiGLU 与激活函数

> 对应 Shazeer, *GLU Variants Improve Transformer*（2020, arXiv:2002.05202）与 LLaMA（Touvron et al., 2023）的工程采用。属模型架构演进板块。

## 一、背景与挑战

Transformer 的前馈网络（FFN）传统用「线性→ReLU/GELU→线性」。ReLU 类激活表达有限、易致死神经元；而门控线性单元（GLU）在 LSTM/卷积中已被证明能显著提升表达力。问题：如何设计一种**门控 FFN**，在几乎不增加推理复杂度的前提下提升 Transformer 的建模能力，并适配现代 LLM 的规模化需求。SwiGLU 即是答案。

## 二、核心原理

SwiGLU 用「门控」替代普通激活：把 FFN 拆成两路，一路经门控激活（SiLU/GELU）后与另一路逐元素相乘，再投影。直觉上，门控让网络**动态选择性地放行**信息，比固定激活更具表达力。代价是比标准 FFN 多一组权重（约 +1/3 参数），但因其提升的效率，常可在更少层数/维度下达到同等效果，整体性价比高。LLaMA、PaLM、Mistral 等主流模型均以 SwiGLU 取代 ReLU FFN。

变体家族（GLU 系列）：基于门控激活不同，有 ReGLU、GEGLU、SwiGLU。SwiGLU 用 SiLU（即 Swish）作门，综合表现最佳。

## 三、形式化与数学基础

标准 FFN（ReLU 版）：

$$
\text{FFN}(x)=W_2\,\sigma(W_1 x)
$$

SwiGLU（门控）定义为：

$$
\text{SwiGLU}(x)=\big(W_1 x\big)\odot \text{SiLU}(W_3 x)\,W_2
$$

其中 $\odot$ 为逐元素乘，$\text{SiLU}(z)=z\cdot\sigma(z)=z/(1+e^{-z})$。对比 GLU 通式 $\text{GLU}(x)=(W_1x)\odot\sigma(W_2x)$，SwiGLU 用 SiLU 替代 sigmoid 门以获得更平滑梯度。参数量：SwiGLU 含 $W_1,W_2,W_3$ 三组（标准 FFN 仅两组），当隐藏维设为 $4d/3$ 时可保持与 $4d$ 标准 FFN 相当的参数量级。

## 四、代码实现

```python
import torch.nn as nn
import torch.nn.functional as F

class SwiGLUFFN(nn.Module):
    def __init__(self, d_model, d_ff):
        super().__init__()
        # 常见 d_ff ≈ 8/3 * d_model（约 2.67d）以补偿多一组权重
        self.w1 = nn.Linear(d_model, d_ff, bias=False)  # 主路
        self.w3 = nn.Linear(d_model, d_ff, bias=False)  # 门路
        self.w2 = nn.Linear(d_ff, d_model, bias=False)  # 输出投影

    def forward(self, x):
        return self.w2(self.w1(x) * F.silu(self.w3(x)))
        # 注意：w1 主路与 w3 门路逐元素乘，再经 w2 投影
```

## 五、与其他技术对比

| 激活/FFN | 公式要点 | 参数量 | 表达力 | 采用情况 |
|---------|---------|--------|--------|---------|
| ReLU FFN | $\max(0,W_1x)$ | 2组 | 低 | 早期 Transformer |
| GELU FFN | 光滑近似门 | 2组 | 中 | BERT/GPT-2 |
| ReGLU | ReLU 门控 | 3组 | 高 | T5 变体 |
| SwiGLU | SiLU 门控 | 3组 | 最高 | LLaMA/PaLM/Mistral |

## 六、常见误区

- 以为 SwiGLU 只是「换个激活」：它本质是门控结构、多一路权重。
- 忽略隐藏维缩放：直接套用 $4d$ 会显著增参，应取约 $8/3\,d$。
- 把 SiLU 与 Sigmoid 门混用，写错 GLU 变体。
- 认为门控「免费提升」——它以增加参数为代价，须在预算内权衡。

## 七、与开源书·权威来源对应

- Shazeer, *GLU Variants Improve Transformer*, 2020（arXiv:2002.05202）。
- Touvron et al., *LLaMA / LLaMA-2*, 2023 明确采用 SwiGLU。
- 本知识库「LLaMA架构要点」「模型架构演进」提供上下文。

## 八、面试题

- SwiGLU 为何常优于 ReLU FFN？门控带来了什么？
- SwiGLU 相比标准 FFN 多了什么、参数量如何变化？
- SiLU 与 GELU 作门控，差异与选择依据？
- 采用 SwiGLU 时，FFN 隐藏维应如何设置以控制总参数？

## 九、演进与趋势

SwiGLU 已成为现代 LLM FFN 的事实标准，并被进一步与「专家混合（MoE）」结合——每个专家内部即用 SwiGLU。研究也在探索更省参的门控（如带有损压缩的低秩门）、以及把激活函数搜索自动化。随量化/稀疏化普及，SwiGLU 的数值特性（平滑、非负区连续）对低精度推理也更友好，预计在可见未来仍是主流选择。

补充实践要点：
- **初始化**：SwiGLU 三路线性层建议相近_scale，避免门路过早饱和或主路过弱。
- **与归一化配合**：Pre-Norm + RMSNorm 下，SwiGLU 的输入已较稳定，残差缩放通常无需额外调整。
- **参数量换算**：当用 $d_{ff}=8/3\,d$ 时，SwiGLU 总参约与「标准 $4d$ ReLU FFN + 注意力」配比持平，便于横向对照模型规模。

## 十、小结

SwiGLU 是一种门控前馈网络：用 SiLU 作门的逐元素门控替代固定激活，以「多一组权重」的代价显著提升表达力，并因性价比高被 LLaMA/PaLM/Mistral 等广泛采用。工程上需将隐藏维调至约 $8/3\,d$ 以保持参数量级。它是现代 LLM「门控 FFN 标配化」的代表，标志着激活设计从「固定非线性」走向「可学习门控」。
