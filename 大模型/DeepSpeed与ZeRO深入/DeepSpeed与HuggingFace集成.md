# DeepSpeed与HuggingFace集成

> 对应 microsoft/DeepSpeed 与 huggingface/transformers Trainer 集成文档。

## 一、背景与挑战
研究者常用 transformers Trainer 训练模型，需无缝接入 ZeRO/Offload 以扩大规模，而不重写训练循环。

## 二、核心原理
Trainer 接受 `deepspeed=` 配置路径，启动时由 DeepSpeed 包裹模型为 `DeepSpeedEngine`，自动应用 ZeRO 分片与梯度累积；检查点经 `zero_to_fp32.py` 重组。

## 三、形式化与数学基础
有效批量 $B = b_{\\mathrm{per\\_gpu}} \\cdot N_{\\mathrm{gpu}} \\cdot G $，
其中 $G$ 为梯度累积步数，ZeRO 不改变数学批量只改变显存布局。

## 四、代码实现
```python
from transformers import Trainer, TrainingArguments
args = TrainingArguments(
    output_dir="out",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,
    deepspeed="ds_z3.json",   # ZeRO-3 配置
)
trainer = Trainer(model=model, args=args, train_dataset=data)
trainer.train()
```

## 五、与其他技术对比
FSDP 也可经 Trainer `fsdp=` 接入；DeepSpeed 在 offload 与 3D 并行上更成熟。Accelerate 提供统一抽象层。

## 六、常见误区
误区一：ZeRO 配置改变学习率语义——不，批量由累积步数决定。误区二：保存的检查点可直接 `from_pretrained`——需先用 `zero_to_fp32.py` 重组。误区三：offload 不影响速度设定。

## 七、与开源书/权威来源对应
huggingface/transformers DeepSpeed 文档；microsoft/DeepSpeed `zero_to_fp32.py` 工具。

## 八、面试题
问：Trainer 如何接 ZeRO-3？答：传入 ds 配置，引擎自动包裹。问：重组检查点为？答：用 `zero_to_fp32.py` 合成 fp16 权重。

## 九、演进与趋势
Accelerate 统一 FSDP/DeepSpeed 后端；配置自动生成工具降低门槛。

## 十、小结
DeepSpeed 与 transformers 集成为大模型训练提供开箱即用的扩展能力，是工业实践主流路径。
