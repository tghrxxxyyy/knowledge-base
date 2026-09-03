# LLMLingua 细粒度压缩

> 对应 Jiang et al., *LLMLingua-2: Data Distillation for Compact Prompts*, 2023。

## 一、背景与挑战

句级删除粒度粗，且小模型自信息估计偏差大；需可微、对齐任务效的压缩。

## 二、核心原理

用文本-标签对训练紧凑压缩器（基于 XLM-RoBERTa 等），直接预测 token 保留概率，并约束压缩后与原 prompt 在下游一致。

## 三、数学形式

保留概率 $p_i = f_\theta(t_i)$；压缩损失结合重建与任务一致性 $\mathcal L = \mathcal L_{rec} + \lambda \mathcal L_{task}$。

## 四、代码实现

```python
out = compressor.compress_prompt(prompt, rate=0.5,
        drop_ratio=0.3, keep_split=True)
```

## 五、与其他对比

- 比 LLMLingua-1（自信息启发式）更准更稳。
- 与 Selective Context 同属压缩但训练方式异。

## 六、常见误区

- 把指令也压缩致模型误解任务。
- 压缩率不随任务调。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：LLMLingua-2 改进？答：用语料训练紧凑压缩器，直接学保留概率并保任务效。

## 九、演进

启发式 → 有监督蒸馏 → 可控压缩率。

## 十、小结

LLMLingua-2 用数据蒸馏实现精准可控压缩，兼顾短与效。
