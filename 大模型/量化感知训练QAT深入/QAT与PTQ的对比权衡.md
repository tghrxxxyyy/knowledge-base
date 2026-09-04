# QAT与PTQ的对比权衡

> 对应 pytorch/pytorch QAT 文档与 Frantar 2022 GPTQ (PTQ) 的对比。

## 一、背景与挑战

部署前需选 PTQ 还是 QAT：前者快、免训练但低比特受限；后者精度高但需数据与算力。权衡取决于位宽、精度预算与资源。

## 二、核心原理

PTQ 仅靠校准集估计统计并量化，适合 8bit 与多数 4bit。QAT 通过训练让网络适应量化，适合 4bit 以下或精度敏感场景。

## 三、形式化与数学基础

PTQ 优化（见 GPTQ）：

$ \\min_{\\hat W}\\|WX-\\hat WX\\|_2^2 $

QAT 优化：

$ \\min_\\theta\\mathbb E_x\\mathcal L(f_{\\tilde W_\\theta}(x),y) $

后者直接优化任务损失，更贴近部署目标。

## 四、代码实现

```python
def decide(ptq_ppl, qat_ppl, budget_bits=4):
    if budget_bits >= 8:
        return "PTQ"          # 8bit PTQ 通常足够
    if ptq_ppl - qat_ppl > 1.0:
        return "QAT"          # 精度差距大用 QAT
    return "PTQ"
```

## 五、与其他技术对比

- GPTQ/AWQ 属 PTQ；QLoRA 训练则含 QAT 思想。
- QAT 上线成本高于 PTQ，但 3bit 往往必需。

## 六、常见误区

- 以为 QAT 一定优于 PTQ；成本与数据门槛高。
- 在 8bit 上强行 QAT，收益不抵开销。

## 七、与开源书/权威来源对应

- pytorch/pytorch: https://github.com/pytorch/pytorch
- Frantar et al. 2022, GPTQ.
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- 何时选 QAT 而非 PTQ？
- QAT 的主要成本？
- 3bit 为什么常需 QAT？

## 九、演进与趋势

PTQ 与 QAT 边界模糊化（如 QAT 仅微调少量层），混合策略普及。

## 十、小结

PTQ 快、QAT 准；按位宽与精度预算选择，低比特敏感场景倾向 QAT。
