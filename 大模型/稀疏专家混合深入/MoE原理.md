# MoE 原理

> 对应 Shazeer et al., *Sparsely-Gated MoE*, 2017；综述见 Fedus et al., *Switch Transformers*, 2022。

## 一、背景与挑战

深度学习模型的性能通常随参数量增长而提升，但稠密模型的参数量与单次前向计算量成正比——参数翻倍，推理算力也翻倍，成本不可承受。稀疏专家混合（Mixture-of-Experts, MoE）的核心思想是：**把参数量与计算量解耦**。它在每一层放置多个「专家」前馈网络，但每个 token 只激活其中少数几个，从而用巨大的总参数量换取更强的表达能力，同时保持单次推理的计算量近似不变。

## 二、核心原理

标准 Transformer 每层是一个前馈网络（FFN）。MoE 把该 FFN 替换为一「专家层」：包含 $E$ 个并行的 FFN 专家 $E_i$ 与一个门控网络 $G$。对输入 token $x$，门控先算各专家得分，取 top-k（通常 k=1 或 2），仅用被选中的专家做计算并加权求和：

$$ y = \sum_{i \in topk(G(x), k)} G_i(x) \cdot E_i(x) $$

未被选中的专家本步完全不参与计算。这样总参数量约等于 $E$ 倍 FFN，而单 token 计算量仅约 $k/E$ 倍，实现「大模型、小算力」。

## 三、形式化与数学基础

门控网络为线性投影加 softmax：

$$ G(x) = \text{Softmax}(W_g x) \in \mathbb{R}^{E} $$

取 top-k 索引 $\mathcal{I} = topk(G(x), k)$，权重归一化后：

$$ w_i = \frac{G_i(x)}{\sum_{j \in \mathcal{I}} G_j(x)}, \quad i \in \mathcal{I} $$

层输出：

$$ y = \sum_{i \in \mathcal{I}} w_i \cdot E_i(x) $$

总参数与激活参数关系：

$$ P_{total} \approx E \cdot P_{ffn}, \quad P_{active} \approx \frac{k}{E} P_{total} + P_{其他} $$

当 $E=8, k=2$ 时，路由部分仅用约 1/4 参数。

## 四、代码实现

```python
import torch

# 极简 MoE 层（示意）
class MoELayer(torch.nn.Module):
    def __init__(self, dim, num_experts=8, k=2):
        super().__init__()
        self.gate = torch.nn.Linear(dim, num_experts, bias=False)
        self.experts = torch.nn.ModuleList(
            [torch.nn.Sequential(
                torch.nn.Linear(dim, 4 * dim),
                torch.nn.ReLU(),
                torch.nn.Linear(4 * dim, dim)) for _ in range(num_experts)])

    def forward(self, x):
        probs = torch.softmax(self.gate(x), dim=-1)   # [tokens, E]
        weights, idx = probs.topk(k=self.k, dim=-1)   # 选 top-k
        out = torch.zeros_like(x)
        for j in range(self.k):
            e = idx[:, j]
            w = weights[:, j].unsqueeze(-1)
            out += w * self.experts[e](x)              # 仅激活被选专家
        return out
```

## 五、与其他技术对比

| 类型 | 参数量 | 单 token 算力 | 显存 |
| --- | --- | --- | --- |
| 稠密模型 | 小 | 全激活 | 低 |
| MoE（总参） | 大 | 仅 top-k | 高（全专家） |
| MoE（激活） | — | 约 k/E | — |

可见 MoE 用显存换算力，把「扩参」与「增算」解耦。

## 六、常见误区

- 认为 MoE 推理更便宜：计算量确实小，但显存需容纳全部专家权重，显存占用接近总参。
- 认为专家会自动形成语义分工：需要负载均衡损失等机制引导，否则易塌缩。
- 混淆总参与会用到的参：汇报模型大小时应区分总参与激活参。

## 七、与开源书·权威来源对应

- Shazeer et al., *Sparsely-Gated MoE*, 2017：MoE 门控与稀疏激活起源。
- Fedus et al., *Switch Transformers*, 2022：把 MoE 扩展到千亿级并系统化容量 / 负载均衡。
- Lepikhin et al., *GShard*, 2021：把 MoE 用于大规模多语言翻译。

## 八、面试题

- MoE 为何能扩参不增算力？答：每 token 仅激活 top-k 专家，总参增大但单步计算量约 k/E 倍。
- 门控网络做什么？答：为每个 token 计算专家得分并选 top-k，决定路由。
- MoE 主要代价？答：显存（全专家常驻）与路由通信（分布式下 all-to-all）。

## 九、演进与趋势

硬路由 → 软门控稀疏（Shazeer 2017）→ Switch top-1（Fedus 2022）→ 细粒度 + 共享专家（DeepSeekMoE）→ expert-choice 路由（专家选 token，零丢弃）。与稀疏注意力、量化协同是落地重点。

## 十、小结

MoE 通过「每层多专家 + 门控稀疏激活」把参数量与计算量解耦，是「大模型低成本」的主流路径；其工程难点集中在负载均衡、显存与通信。
