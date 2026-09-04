# Lion在LLM训练中的采用

> 对应 Chen 2023 Lion (arXiv:2302.06675) 与 karpathy/nanoGPT 社区实践。

## 一、背景与挑战
大模型预训练周期长、显存紧，任何优化器层面的状态节省都能放大为可观成本下降。

## 二、核心原理
Lion 因省一半状态，在同样硬件下可支持更大 batch 或更大模型；符号更新也利于低精度实现。

## 三、形式化与数学基础
在固定显存预算 M 下，可训练参数量约 `P ∝ M / (param + state)`。状态从 2 份降到 1 份，P 可提升约 30%（粗略估计，依赖混合精度配置）。

## 四、代码实现
```python
# 在 nanoGPT 风格训练里替换优化器
from torch.optim import AdamW
# opt = AdamW(...)  默认
# 切 Lion 需自定义 Lion 类并降低 lr
# opt = Lion(model.parameters(), lr=1e-4, betas=(0.95, 0.98))
```

## 五、与其他技术对比
相比 AdamW 的广泛验证，Lion 在超大规模上的长期稳定性仍需更多公开报告；很多团队仍用 AdamW 保底。

## 六、常见误区
盲目追求状态节省而忽略调参成本，反而拖慢整体进度。

## 七、与开源书/权威来源对应
Chen 2023 Lion 报告语言模型实验；karpathy/nanoGPT 默认 AdamW，社区有 Lion 分支。

## 八、面试题
问：何时值得用 Lion 训 LLM？答：显存受限且愿投入 lr/β 调参时。

## 九、演进与趋势
Lion + FP8 状态 + ZeRO 切分，是降本的重要组合。

## 十、小结
Lion 为 LLM 训练提供显存与速度空间，但是否采用取决于调参预算。
