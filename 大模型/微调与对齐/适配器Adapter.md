# Adapter 适配层

> 对应 Houlsby et al., *Parameter-Efficient Transfer Learning for NLP*, 2019。

## 一、背景与挑战

早在 BERT 时代，全参数微调每任务需保存完整权重（如 BERT-Large 3.35 亿参数），多任务部署成本极高。Adapter 是最早的系统化 PEFT 方案：在冻结的预训练 Transformer 每一层后插入一个小型「瓶颈」模块，仅训练这些适配器，主干完全不动。这使得同一基座可挂载多个轻量适配器、按需切换，并天然缓解灾难性遗忘。

## 二、核心原理

Adapter 在子层（如注意力输出后、FFN 后）插入一个瓶颈 MLP：

$$
\text{Adapter}(x) = x + W_{up}\,\sigma\!\big(W_{down}\,\text{LayerNorm}(x)\big)
$$

其中 $W_{down}: d\to b$（降维），$W_{up}: b\to d$（升维），$b\ll d$（典型 $b=64$ 或 $d/4$ 量级）。瓶颈迫使信息流经极窄通道，限制可训练参数量；残差连接 $+x$ 保证即便适配器参数接近零，模型退化为原始主干，训练起点安全。

## 三、形式化与数学基础

设隐藏维度 $d$，每层适配器参数量为 $2\cdot b\cdot d + b + d$（含偏置）。当 $d=4096, b=64$ 时，每层约 $2\times64\times4096\approx 0.5$ M，整模型约数百 M，仅占总参数约 $1\%\sim3\%$。Houlsby 配置在每层两个子层后各放一个 Adapter；后续 Pfeiffer 配置提出仅在 FFN 后放置（减少延迟），参数量进一步下降而性能接近。

对比 LoRA：Adapter 是**串行**插入新模块，增加推理延迟；LoRA 是**并行**低秩增量，可合并进原权重、零额外延迟。这是二者工程取舍的核心差异。

## 四、代码实现

```python
import torch.nn as nn

class Adapter(nn.Module):
    def __init__(self, d=4096, bottleneck=64):
        super().__init__()
        self.down = nn.Linear(d, bottleneck)
        self.up   = nn.Linear(bottleneck, d)
        self.act  = nn.GELU()
        nn.init.zeros_(self.up.weight)   # 零初始化使起点=恒等

    def forward(self, x):
        return x + self.up(self.act(self.down(x)))
```

```python
# 把 Adapter 挂到 Transformer 每层 FFN 之后，冻结主干
for p in backbone.parameters():
    p.requires_grad = False
backbone.ffn = nn.Sequential(backbone.ffn, Adapter())
```

## 五、与其他技术对比

| 方法 | 插入方式 | 可训练占比 | 推理延迟 | 抗遗忘 |
|------|----------|------------|----------|--------|
| 全参数 FT | 改全部 | 100% | 无 | 弱 |
| Adapter | 串行瓶颈 | ~1–3% | 有（串行） | 强 |
| LoRA | 并行低秩 | ~0.1–1% | 可合并消除 | 中 |
| Prefix | 每层前缀 | <1% | K/V 略增 | 中 |

## 六、常见误区

- 认为 Adapter 与 LoRA 等价：LoRA 可合并进权重、零延迟，Adapter 串行必增延迟。
- 忽略零初始化：若不上采样层零初始化，训练起点偏离恒等映射，收敛更慢甚至不稳。
- 瓶颈 $b$ 过大：退化为接近全参数，失去 PEFT 优势。
- 每层都加导致延迟翻倍却无明显收益：应按下游任务选择放置位置（Houlsby vs Pfeiffer 配置）。

## 七、与开源书·权威来源对应

- Houlsby et al., *Parameter-Efficient Transfer Learning for NLP*, 2019（arXiv:1902.00751）。
- Pfeiffer et al., *AdapterFusion / MAD-X*, 2020 多语言/多任务适配。
- Hugging Face PEFT `Adapters` 库与 `adapter-transformers`。

## 八、面试题

- Adapter 与 LoRA 的本质区别？为何 Adapter 更抗灾难性遗忘？
- 为什么 Adapter 的上采样层常零初始化？
- Adapter 的瓶颈维度 $b$ 如何影响表现与效率？
- Houlsby 与 Pfeiffer 配置有何不同？

## 九、演进与趋势

Adapter 催生了 AdapterHub 生态、AdapterFusion（组合多任务适配器）、以及语言/模态专用适配器（MAD-X）。虽在 LLM 时代常被 LoRA 取代（因延迟），其「模块化、可组合」思想深刻影响了后续参数高效方法。以官方最新文档为准。

**实践要点：**

- 瓶颈维度 $b$ 常用 $d/4$ 或固定 64，过大会退化为接近全参数、失去 PEFT 优势，过小则容量不足。
- 放置位置可选「仅 FFN 后」（Pfeiffer）以减延迟，或「注意力 + FFN 后」（Houlsby）以增容量，按延迟预算权衡。
- 适配器可序列化存储为独立模块，多任务时只换适配器权重、主干常驻，便于服务部署。
- 与 LoRA 组合（串行 Adapter + 并行 LoRA）可在极低参数下兼顾稳定与表达力。

## 十、小结

Adapter 以串行瓶颈模块实现极省参数的迁移，是 PEFT 的奠基性方法；其模块化组合思想至今有价值，但推理延迟使其在追求零开销的 LLM 场景让位于 LoRA。
