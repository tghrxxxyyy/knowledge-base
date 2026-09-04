# 序列级蒸馏与TinyBERT方法

> 对应 TinyBERT (Jiao 2019) 与 huggingface/transformers 的小模型蒸馏实践。

## 一、背景与挑战

Transformer 大模型中，如何把 BERT 类教师压缩到 1/7 参数且保留多数能力？TinyBERT 提出两阶段（通用 + 任务）蒸馏，覆盖嵌入、注意力、隐状态、logits。

## 二、核心原理

TinyBERT 在 transformer 层做三层蒸馏：注意力矩阵、隐状态（经投影）、以及最终 logits。先在通用语料预蒸馏得通用小模型，再在目标任务上蒸馏适配。

## 三、形式化与数学基础

总损失：

$ \\mathcal L=\\sum_{l\\in\\{att,hn,out\\}}\\lambda_l\\mathcal L_l $

其中 $ \\mathcal L_{att},\\mathcal L_{hn} $ 为 MSE，$ \\mathcal L_{out} $ 为 KL 蒸馏损失。

## 四、代码实现

```python
import torch

def tinybert_loss(att_s, att_t, h_s, h_t, proj, logits_s, logits_t, T=4.0):
    la = F.mse_loss(att_s, att_t.detach())
    lh = F.mse_loss(proj(h_s), h_t.detach())
    lo = F.kl_div(F.log_softmax(logits_s / T, -1),
                  F.softmax(logits_t / T, -1), reduction="batchmean") * T * T
    return la + lh + lo
```

## 五、与其他技术对比

- 相比纯 logits 蒸馏，TinyBERT 多阶段多层级，保真度更高。
- 与 LoRA 微调不同，蒸馏目标是压缩而非适配。

## 六、常见误区

- 只做任务阶段跳过通用阶段，小模型欠训练。
- 层数映射不当（教师 12 层映射学生 4 层）导致信息错位。

## 七、与开源书/权威来源对应

- huggingface/transformers: https://github.com/huggingface/transformers
- huggingface/trl: https://github.com/huggingface/trl
- pytorch/pytorch: https://github.com/pytorch/pytorch

## 八、面试题

- TinyBERT 的两阶段是什么？
- 为什么需要注意力蒸馏？
- 教师学生层数不同如何映射？

## 九、演进与趋势

序列级蒸馏扩展到生成式 LLM（如蒸馏小 Chat 模型），与指令微调结合。

## 十、小结

TinyBERT 以多层级 + 两阶段蒸馏，成为 NLP 小模型压缩的范本。
