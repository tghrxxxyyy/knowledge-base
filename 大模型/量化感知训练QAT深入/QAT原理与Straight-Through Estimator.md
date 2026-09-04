# QAT原理与Straight-Through Estimator

> 对应 pytorch/pytorch 的 Quantization-Aware Training 与 Kingma & Ba 2015 优化基础。

## 一、背景与挑战

PTQ 在低比特易失效。量化感知训练 (QAT) 在训练前向中模拟量化误差，让网络"习惯"低精度，从而恢复精度。核心是如何让不可导的 round 可反向传播。

## 二、核心原理

前向用伪量化 $ \\tilde w=\\text{quant}(w) $ 计算，反向时把 round 的梯度近似为 1（Straight-Through Estimator, STE），使梯度可流过量化节点。

## 三、形式化与数学基础

伪量化：

$ \\tilde w=s\\cdot \\text{round}(w/s),\\quad s=\\frac{\\max(|w|)}{2^{b-1}-1} $

STE 梯度：

$ \\frac{\\partial \\tilde w}{\\partial w}=1 $

## 四、代码实现

```python
import torch

class FakeQuant(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x, bits=4):
        s = x.abs().max() / (2 ** (bits - 1) - 1)
        return torch.clamp(torch.round(x / s), -(2 ** (bits - 1)), 2 ** (bits - 1) - 1) * s

    @staticmethod
    def backward(ctx, g):
        return g, None     # STE: 梯度直通

def fake_quant(x, bits=4):
    return FakeQuant.apply(x, bits)
```

## 五、与其他技术对比

- 相比 PTQ：QAT 精度更高但需训练数据与算力。
- STE 是 QAT 可训练的关键近似。

## 六、常见误区

- 误用真实 round 梯度（为 0）导致不更新。
- 训练初期就强量化，破坏收敛。

## 七、与开源书/权威来源对应

- pytorch/pytorch: https://github.com/pytorch/pytorch
- Kingma & Ba 2015, Adam (https://github.com/pytorch/pytorch)
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- QAT 为什么需要 STE？
- STE 的梯度近似合理吗？缺陷？
- QAT 与 PTQ 取舍？

## 九、演进与趋势

更优梯度近似（如软量化 differentiable rounding）与 LSQ 学习 scale/zero 是方向。

## 十、小结

QAT 用伪量化 + STE 把量化误差纳入训练，是低比特精度的强保障。
