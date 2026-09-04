# Lion的参数高效特性

> 对应 Chen 2023 Lion (arXiv:2302.06675)。

## 一、背景与挑战
当模型参数量进入百亿、千亿，优化器状态（如 Adam 的 m、v）占显存可达参数本身的 2 倍（FP16 参数 + FP32 状态），成为扩展瓶颈。

## 二、核心原理
Lion 每个参数只保留一个与参数同形状的动量缓冲区，状态显存从 2 份降到 1 份（甚至可用低精度存动量），在 ZeRO 切分下收益显著。

## 三、形式化与数学基础
显存占用对比：AdamW 状态 `2·P·prec`，Lion 状态 `1·P·prec`。对 P=7B、FP32 状态，AdamW 约 28GB 状态，Lion 约 14GB。

## 四、代码实现
```python
# 状态张量数量对比
adamw_state = {"exp_avg": torch.zeros_like(p), "exp_avg_sq": torch.zeros_like(p)}
lion_state  = {"momentum": torch.zeros_like(p)}   # 仅一份
```

## 五、与其他技术对比
Adafactor 通过因式分解二阶矩也减少状态，但实现复杂；Lion 直接去掉二阶矩，更简洁。

## 六、常见误区
以为省状态就能直接更快；Lion 每步计算量相近，主要收益在显存与可扩展性。

## 七、与开源书/权威来源对应
Chen 2023 Lion 报告在 ImageNet、语言模型上以更少状态达到同等效果；microsoft/DeepSpeed 可配合切分。

## 八、面试题
问：7B 模型用 Lion 省多少优化器显存？答：约省一份 FP32 动量，约 14GB。

## 九、演进与趋势
与 8bit 状态、FSDP 切分结合，进一步释放大模型训练显存。

## 十、小结
Lion 的参数高效性使其在资源受限的大规模训练中具有现实价值。
