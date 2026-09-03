# 序列并行与归一化/Dropout

> 对应 Megatron-LM 序列并行；Korthikanti et al., 2022。

## 一、背景与挑战

LayerNorm、Dropout 在序列维独立，原被复制到全序列，浪费显存与算力。

## 二、核心原理

这些算子对序列每个位置独立，可在序列分片上直接算；Dropout 掩码需各卡一致（用相同种子或广播掩码）以保证数值等价。

## 三、数学形式

$LN(x)_i=\frac{x_i-\mu_i}{\sigma_i}\gamma+\beta$，每位置 $i$ 独立；分片计算 $\mu_i,\sigma_i$ 不需跨卡。

## 四、代码实现

```python
torch.manual_seed(seed)                  # 各卡同种子保证 dropout 掩码一致
drop = F.dropout(x_shard, p=0.1)
```

## 五、与其他对比

- 与 张量并行深入 中归一化需 all-gather 相反，SP 直接局部算。
- 与 专家并行深入 不冲突可叠加。

## 六、常见误区

- Dropout 掩码不一致致各卡行为不同、训练不稳。
- 误在归一化后切权重（应切序列）。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何 SP 能在 LayerNorm 前不聚合？答：归一化逐位置独立，分片上可正确计算。

## 九、演进

全序列复制 → 序列分片 → 掩码同步。

## 十、小结

归一化/Dropout 逐位置独立，序列并行可免聚合直接局部算。
