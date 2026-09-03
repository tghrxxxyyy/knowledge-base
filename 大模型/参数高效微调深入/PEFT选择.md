# PEFT方法选择

> 对应 llm-course 与 peft 库实践；与 微调与对齐 / 指令数据构建深入 衔接。

## 一、背景与挑战

方法众多，需按任务、资源、延迟、多任务需求选型。

## 二、核心原理

决策维度：可训参数量、推理开销、是否改结构、多任务切换、质量上限。

## 三、数学形式

粗略排序（参数量/延迟）：Prompt-Tuning < Prefix < LoRA < Adapter < 全微调；质量反之近似递增。

## 四、代码实现

```python
from peft import get_peft_config, LoraConfig, PrefixConfig
cfg = LoraConfig(r=8, alpha=16, target_modules=["q","v"])
```

## 五、与其他对比

- 低延迟服务：LoRA 可合并权重无额外延迟，优于 Adapter（串行）。
- 多任务：各任务独立 LoRA 适配器热插拔比多份全模型省。

## 六、常见误区

- 盲目用最大秩；应先小秩网格搜索。
- 忽视 target_modules 选择（只改 Q/V 常足够）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 服务多任务如何选 PEFT？答：独立 LoRA 适配器合并权重，热切换省显存。

## 九、演进

手工选 → 自动搜索 PEFT 配置 → 混合 PEFT。

## 十、小结

PEFT 选型需综合参数量、延迟与质量，LoRA 因可合并权重在多场景占优。
