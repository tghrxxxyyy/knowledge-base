# 低位QAT实践

> 对应 4-bit/2-bit QAT 与 LLM.int8()/GPTQ 对照。

## 一、背景与挑战

4-bit 及以下 QAT 难度陡增，需混合策略与敏感层保护。

## 二、核心原理

对敏感层（如 layernorm、某些注意力）保留高精度，其余低位；结合渐进式量化（逐步降位）。

## 三、数学形式

混合精度：位宽向量 $b_l$，逐层搜索使精度损失最小、体积约束内。

## 四、代码实现

```python
for name, m in model.named_modules():
    bits = 4 if not sensitive(name) else 8
    m.qconfig = qconfig_map[bits]
```

## 五、与其他对比

- QAT 通常比 GPTQ/AWQ（PTQ）更准但更贵。
- 与 QLoRA 互补（QLoRA 不训全量）。

## 六、常见误区

- 所有层同低位致关键层崩。
- 忽略校准数据代表性。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 为何混合精度量化？答：不同层对低位敏感度不同，混合保精度降体积。

## 九、演进

均匀低位 → 混合精度 → 可学习位宽。

## 十、小结

低位 QAT 靠混合精度与渐进策略在体积与精度间取得平衡。
