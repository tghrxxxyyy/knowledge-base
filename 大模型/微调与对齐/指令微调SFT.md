# 指令微调 SFT

> 对应 rasbt/LLMs-from-scratch 第7章「Instruction Fine-Tuning」与 llm-course「Instruction fine-tuning」。

## 一、核心概念

**SFT(Supervised Fine-Tuning)** 用「指令-回答」配对数据继续训练，使预训练模型学会遵循人类指令格式。是「基础模型 → 对话模型」的关键一步。

数据形式：

```
{"instruction": "翻译为英文", "input": "你好世界", "output": "Hello world"}
```

或使用对话模板（system/user/assistant 轮次）。

## 二、数学形式

目标仍是自回归交叉熵，但仅在**回答部分**计算损失（prompt 部分 `loss_mask=0`）：

```
L = - Σ_{t∈answer} log P(x_t | x_{<t}; θ)
```

## 三、代码实现（loss mask 示意）

```python
# labels 中 prompt 部分填 -100，PyTorch 会忽略
labels = input_ids.clone()
labels[attention_mask == 0] = -100
labels[:, :prompt_len] = -100
loss = model(input_ids, labels=labels).loss
```

## 四、关键要点

| 项 | 说明 |
|----|------|
| 数据质量 | 比数量更重要 |
| loss mask | 仅回答算损失 |
| 模板 | 与推理一致 |
| 规模 | 数千~数万条可显著改善 |

## 五、常见误区

- 忘记 loss mask，prompt 也参与反向传播导致指令被「学歪」。
- SFT 数据格式与推理模板不一致，部署时退化。

## 六、与开源书的对应

- rasbt/LLMs-from-scratch Ch.7：https://github.com/rasbt/LLMs-from-scratch
- llm-course「Instruction fine-tuning」：https://github.com/mlabonne/llm-course
- 经典数据集：Stanford Alpaca (self-instruct)。

## 七、面试题

- SFT 中为何要对 prompt 部分做 loss mask？
- SFT 数据规模大致多少能见效？质量与数量如何权衡？
