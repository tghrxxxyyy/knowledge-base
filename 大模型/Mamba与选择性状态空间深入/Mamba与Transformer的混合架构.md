# Mamba与Transformer的混合架构

> 对应 AI21 Jamba; Cartesia AI 等。

## 一、背景与挑战
Mamba 长程依赖强、推理便宜，但局部精确模式（如复制任务）弱。Transformer 反之。混合可兼得。

## 二、核心原理
方案1：层间交替（每 $n$ 层 Mamba 后跟 $m$ 层 Attention）。
方案2：层内混合（Mamba + Attention 并行或串行）。
方案3：Jamba 风格，比例为 1:7 或 1:8，Attention 仅占少数。

## 三、形式化与数学基础
设 $L$ 总层数，$L_a$ Attention 层，$L_m = L - L_a$ Mamba 层。Jamba 经验 $L_a/L = 1/8$。混合模型在困惑度与吞吐量间权衡。

## 四、代码实现
```python
class HybridBlock(nn.Module):
    def __init__(self, d, kind):
        super().__init__()
        if kind == 'mamba':
            self.block = MambaBlock(d)
        else:
            self.block = TransformerBlock(d)
    def forward(self, x):
        return self.block(x)
```

## 五、与其他技术对比
- vs 纯 Mamba：混合后长程与短程兼顾。
- vs 纯 Transformer：混合后推理更快，内存更省。

## 六、常见误区
- 比例过倾向 Mamba 会失去精确模式。
- 比例过倾向 Transformer 失去 Mamba 优势。

## 七、与开源书/权威来源对应
- ai21labs/Jamba 仓库。
- d2l-ai/d2l-zh。

## 八、面试题
- 为何要混合？答：互补优势，平衡质量与效率。

## 九、演进与趋势
纯 Mamba / 纯 Transformer → 混合架构（Jamba、Zamba）。

## 十、小结
混合架构是当前大模型架构演进的重要方向，平衡 Mamba 与 Transformer 优势。
