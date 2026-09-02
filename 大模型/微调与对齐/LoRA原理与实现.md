# LoRA：低秩适配原理与实现

> 对应 rasbt/LLMs-from-scratch 附录 E 与 Hu et al., *LoRA*, 2021。本系列重点文档。

## 一、核心概念

LoRA(Low-Rank Adaptation) 假设权重更新 `ΔW` 是低秩的，用两个小矩阵分解：

```
W = W_0 + ΔW = W_0 + B A
```

其中 `W_0 ∈ ℝ^{d×k}` 冻结，`B ∈ ℝ^{d×r}`, `A ∈ ℝ^{r×k}`，秩 `r ≪ min(d,k)`。前向：

```
h = W_0 x + (B A) x = W_0 x + α/r · B A x
```

`α`(lora_alpha) 控制缩放，实际缩放因子为 `α/r`。

## 二、数学形式

可训练参数从 `d·k` 降到 `r(d+k)`。例如 `d=k=4096, r=8`：原 ~16.8M → 现 ~65K，降约 256 倍。

## 三、代码实现

```python
import torch, torch.nn as nn
class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, r=8, alpha=16):
        super().__init__()
        self.base = base; self.base.weight.requires_grad_(False)
        d, k = base.weight.shape
        self.A = nn.Parameter(torch.randn(r, k) * 0.01)
        self.B = nn.Parameter(torch.zeros(d, r))
        self.scaling = alpha / r
    def forward(self, x):
        return self.base(x) + (x @ self.A.T @ self.B.T) * self.scaling
```

## 四、关键要点

| 超参 | 作用 | 常用 |
|------|------|------|
| r | 秩，容量 | 8/16/64 |
| alpha | 缩放 | 16/32 |
| target | 注入层 | q/v/k/o_proj |

## 五、常见误区

- 误把 `alpha` 当学习率；它只是缩放，与 `r` 比值决定强度。
- `target_modules` 选错（只改 `v` 不改 `q`）效果差。
- 推理时未合并或加载错误适配器。

## 六、与开源书的对应

- Hu et al., *LoRA: Low-Rank Adaptation of Large Language Models*, 2021 (arXiv:2106.09685).
- rasbt/LLMs-from-scratch Appendix E: https://github.com/rasbt/LLMs-from-scratch
- 官方实现：https://github.com/microsoft/LoRA

## 七、面试题

- 为何 LoRA 假设权重更新低秩合理？
- `alpha` 与 `r` 的比值代表什么？
- 如何估算 LoRA 训练的参数量节省？
