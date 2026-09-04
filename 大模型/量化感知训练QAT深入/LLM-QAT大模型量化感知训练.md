# LLM-QAT大模型量化感知训练

> 对应 pytorch/pytorch QAT 与 huggingface/trl 的训练框架（LLM 场景的 QAT 实践）。

## 一、背景与挑战

把 QAT 用到十亿级以上 LLM 成本高：需可微伪量化、梯度穿透量化权重，且训练数据有限时还要用模型自生成数据。

## 二、核心原理

LLM-QAT 在预训练/微调阶段插入伪量化，权重与激活均模拟低比特；可用教师生成的数据做自蒸馏式 QAT，使小位宽模型继承能力。

## 三、形式化与数学基础

训练目标结合任务损失与蒸馏：

$ \\mathcal L=\\mathcal L_{task}(f_{\\tilde W}(x),y)+\\lambda\\mathcal L_{KD}(f_{\\tilde W},f_{teacher}) $

其中 $ \\tilde W $ 为伪量化权重，梯度经 STE 回传。

## 四、代码实现

```python
import torch

def llm_qat_step(model, teacher, x, y, T=4.0):
    model.train()
    out = model(x)                       # 内含伪量化
    with torch.no_grad():
        t = teacher(x)
    loss = F.cross_entropy(out.logits, y) + \
           T * T * F.kl_div(F.log_softmax(out.logits / T, -1),
                            F.softmax(t.logits / T, -1), reduction="batchmean")
    loss.backward()
    return loss
```

## 五、与其他技术对比

- 相比 GPTQ/AWQ (PTQ)，LLM-QAT 精度上限更高但需训练。
- 与 QLoRA 不同，QLoRA 只训 LoRA 分支，QAT 直接训练量化权重。

## 六、常见误区

- 在无数据时用随机数据 QAT，学生学不到分布。
- 伪量化未覆盖注意力分数，导致部署失配。

## 七、与开源书/权威来源对应

- pytorch/pytorch: https://github.com/pytorch/pytorch
- huggingface/trl: https://github.com/huggingface/trl
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- LLM-QAT 与普通 QAT 区别？
- 为什么可用生成数据做 QAT？
- QAT 与 QLoRA 训练对象差异？

## 九、演进与趋势

数据高效 QAT、与 LoRA 融合以及 2-3bit 可用化是研究方向。

## 十、小结

LLM-QAT 把伪量化训练扩展到大模型，配合自蒸馏数据，是极低比特部署的有力手段。
