# LoRA低秩适配的压缩视角

> 对应 Hu 2021 LoRA (arXiv:2106.09685) 与 huggingface/peft 实现。

## 一、背景与挑战

微调大模型代价高。LoRA 冻结原权重，仅训练低秩增量 $ \\Delta W=BA $，参数量骤降。从压缩视角看，它假设权重更新是低秩的。

## 二、核心原理

原前向 $ h=Wx $，LoRA 加 $ \\Delta W x=BAx $，其中 $ B\\in\\mathbb R^{m\\times r},A\\in\\mathbb R^{r\\times n} $，$ r\\ll\\min(m,n) $。训练只优化 A、B，推理可把 $ BA $ 合并回 $ W $ 无额外延迟。

## 三、形式化与数学基础

$ h=Wx+\\Delta Wx=Wx+BAx $

参数量从 $ mn $ 降为 $ r(m+n) $。合并后 $ W'=W+BA $，前向不变。

## 四、代码实现

```python
import torch

class LoRA(torch.nn.Module):
    def __init__(self, W, r=8, alpha=16):
        super().__init__()
        self.W = W                       # 冻结
        self.A = torch.nn.Parameter(torch.randn(W.shape[1], r) * 0.01)
        self.B = torch.nn.Parameter(torch.zeros(W.shape[0], r))
        self.scale = alpha / r

    def forward(self, x):
        return self.W(x) + self.scale * (x @ self.A @ self.B.t())
```

## 五、与其他技术对比

- 与 SVD 低秩压缩目标不同：LoRA 为少参训练，非部署压缩。
- 与 QAT/量化正交，可组合（量化基座 + LoRA 适配）。

## 六、常见误区

- 以为 LoRA 自动压缩部署体积；推理合并后与原模型同大。
- r 越大越好；过大失去低秩优势。

## 七、与开源书/权威来源对应

- Hu et al. 2021, LoRA: Low-Rank Adaptation.
- huggingface/peft: https://github.com/huggingface/peft
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- LoRA 为何参数量小？
- 推理如何消除额外延迟？
- LoRA 与低秩压缩关系？

## 九、演进与趋势

QLoRA (Dettmers 2023) 把 4bit 基座 + LoRA 结合，进一步降显存；DoRA 等变体提升表达。

## 十、小结

LoRA 以低秩增量实现少参适配，其低秩假设也是权重压缩的理论依据之一。
