# 投影层设计MLP与注意力

> 对应 Liu et al. 2023 「Visual Instruction Tuning」(LLaVA) 中 projector 设计。

## 一、背景与挑战

视觉编码器输出维度（如 ViT-L/14 为 1024）与 LLM 词嵌入维度（如 4096）不一致，且语义空间不同。需在二者间插入投影层将视觉 token 映射到语言模型可理解的空间。设计选择影响对齐质量、参数效率与训练稳定性。

## 二、核心原理

LLaVA 提出两种 projector：线性层与两层 MLP（含 GELU），后者显著更好，因视觉与语言特征非线性错位需用非线性映射。后续工作引入 cross-attention 或 Q-Former 式可学习 query 做视觉 token 压缩与语义提炼，减少冗余 patch token 数量。

## 三、数学形式

线性投影：h = z^I W + b。两层 MLP：
h = W_2\,\mathrm{GELU}(W_1 z^I + b_1) + b_2
注意力式压缩：q_i \in \mathbb{R}^{M\times d}，输出 c_i=\mathrm{Attention}(q_i, K^V, V^V)，将 N 个视觉 token 压至 M 个语义 token。

## 四、代码实现

```python
import torch.nn as nn

class MLPProjector(nn.Module):
    def __init__(self, in_dim=1024, hidden=4096, out_dim=4096):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden), nn.GELU(),
            nn.Linear(hidden, out_dim))
    def forward(self, z):
        return self.net(z)            # [B, N, in] -> [B, N, out]
```

## 五、与其他对比

相比直接拼接，projector 提供可学习语义桥；相比 Q-Former（BLIP-2）重采样，MLP 更轻量、保留空间细节；相比 perceiver 式压缩，MLP 不减少 token 数但训练简单。LLaVA-1.5 用两层 MLP 即获强性能。

## 六、常见误区

以为投影层可随机初始化后不训练，实则需与 LLM 对齐微调；忽略视觉 token 数过大导致上下文膨胀；混淆 projector 与 vision tower 冻结策略；用单线性层常欠拟合。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：为何两层 MLP 优于线性投影？答：视觉-语言特征非线性错位需非线性映射拟合。
- Q：能否减少视觉 token 数？答：可用 Q-Former 或可学习 query 压缩，节省算力。
- Q：投影层训练时视觉塔是否冻结？答：LLaVA 常冻结视觉塔、仅训投影与 LLM。

## 九、演进

从线性到 MLP，再到 Q-Former、Resampler、可变形卷积下采样；出现动态分辨率与 token 合并（如 pixel shuffle）以降低序列长度。

## 十、小结

投影层是视觉与语言空间之间的语义桥梁，虽小却关键；其结构从线性演变为 MLP 再到重采样器，持续在质量与效率间寻找平衡。
