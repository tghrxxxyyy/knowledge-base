# 梯度累积与BatchNorm

> 对应 pytorch/pytorch BatchNorm 行为与 d2l-ai/d2l-zh 归一化章节。

## 一、背景与挑战
BN 的统计量基于当前 micro-batch 计算，梯度累积时每个 micro-batch 的均值/方差不同，与逻辑大 batch 的 BN 不一致。

## 二、核心原理
BN 在训练时采用当前批统计，累积多个 micro-batch 不会自动合并统计量，导致等效 batch 语义偏差；推理用滑动平均。

## 三、形式化与数学基础
BN：`y = (x-μ_B)/√(σ_B²+ε)·γ+β`，μ_B、σ_B 仅来自当步 micro-batch，与累积步数 K 无关。

## 四、代码实现
```python
# Transformer 中常改用 LN 规避该问题
norm = torch.nn.LayerNorm(d_model)   # 不依赖 batch 统计
# 而非 BatchNorm1d，避免累积下统计错位
```

## 五、与其他技术对比
LayerNorm/RMSNorm 基于特征维，与 batch 大小无关，天然适配累积；BN 受 micro-batch 影响。

## 六、常见误区
以为累积 K 步等效于 BN 看到 K 倍 batch；实际每步 BN 仍只看 micro-batch。

## 七、与开源书/权威来源对应
d2l-ai/d2l-zh BatchNorm 章节；pytorch/pytorch `BatchNorm` 文档。

## 八、面试题
问：为何大模型多用 LN 而非 BN？答：LN 不依赖 batch 统计，适配小 micro-batch 与累积。

## 九、演进与趋势
RMSNorm 进一步替代 LN，计算更省。

## 十、小结
累积下应选不依赖 batch 的归一化，避免统计错位。
