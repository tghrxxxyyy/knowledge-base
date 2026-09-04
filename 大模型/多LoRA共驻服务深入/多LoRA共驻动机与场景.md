# 多LoRA共驻动机与场景

> 对应 Hu 2021 LoRA; Dettmers 2023 QLoRA; huggingface/peft。

## 一、背景与挑战
为每个任务部署独立微调模型成本高。LoRA 仅训练低秩增量，多适配器可共享同一基础模型权重，极大节省显存。

## 二、核心原理
基础模型权重 W 固定，各任务有独立 A_i B_i 增量。共驻服务在同一批次内对序列打上适配器标识，前向时对应该 LoRA 的增量参与计算。

## 三、形式化与数学基础
LoRA 改造：
$ h = W x + \frac{\alpha}{r} B A x,\quad B \in \mathbb{R}^{d\times r},\ A \in \mathbb{R}^{r\times k} $
多适配器时按请求路由选择 (A_i, B_i)。

## 四、代码实现
```python
def lora_forward(x, W, adapter):
    A, B, s = adapter.A, adapter.B, adapter.scale
    return x @ W.T + s * (x @ A.T) @ B.T
```

## 五、与其他技术对比
全微调多模型显存×N；多LoRA共驻基础权重共享，仅增量占额外显存，成本骤降。

## 六、常见误区
误区：LoRA 越多越慢。若批内同适配器，开销近零；异构混合才有切换成本。

## 七、与开源书/权威来源对应
Hu et al. 2021 LoRA; Dettmers et al. 2023 QLoRA。见 huggingface/peft、vllm-project/vllm。

## 八、面试题
问：多LoRA共驻为何省显存？
答：基础权重与KV缓存共享，仅各适配器低秩矩阵额外驻留。

## 九、演进与趋势
LoRA 交换入显存、按需加载，支持千级适配器共驻。

## 十、小结
多LoRA共驻把“一个模型服务多任务”成本压到极低，是多租户微调服务核心。
