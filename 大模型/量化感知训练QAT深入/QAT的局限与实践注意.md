# QAT的局限与实践注意

> 对应 pytorch/pytorch QAT 文档与社区实践经验。

## 一、背景与挑战

QAT 虽强但有成本与陷阱：需训练数据、算力，且 STE 的梯度近似在极低比特下偏差大，可能不收敛或收益递减。

## 二、核心原理

STE 假设量化节点梯度为 1，但实际量化是非恒等映射，梯度估计有偏；位宽越低偏差越大。此外 QAT 对学习率、量化范围初始化敏感。

## 三、形式化与数学基础

真实梯度应为 0（round 不可导），STE 用 1 近似：

$ \\hat g=\\frac{\\partial \\mathcal L}{\\partial \\tilde w}\\cdot \\frac{\\partial \\tilde w}{\\partial w}\\approx \\frac{\\partial \\mathcal L}{\\partial \\tilde w} $

当 $ \\tilde w $ 与 $ w $ 差异大（低位宽），该近似误差显著。

## 四、代码实现

```python
def qat_warmup(model, loader, epochs=1):
    # 先以 FP 训练稳定, 再逐步开启伪量化
    for p in model.parameters():
        p.requires_grad = True
    # 建议: 量化范围用滑动平均 (EMA) 统计, 而非单 batch
    print("用 EMA 更新 scale/zero, 避免量化范围抖动")
```

## 五、与其他技术对比

- PTQ 无训练风险但上限低；QAT 上限高但工程复杂。
- 混合策略（仅敏感层 QAT）更稳。

## 六、常见误区

- 直接全强度 QAT 从头训，破坏预训练特征。
- 量化范围用单 batch 统计，推理时偏移大。

## 七、与开源书/权威来源对应

- pytorch/pytorch: https://github.com/pytorch/pytorch
- huggingface/transformers: https://github.com/huggingface/transformers
- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM

## 八、面试题

- STE 的偏差从哪来？
- QAT 训练不稳定怎么办？
- 何时 QAT 收益递减？

## 九、演进与趋势

可微量化 (soft-to-hard annealing)、LSQ 与更稳梯度近似缓解局限。

## 十、小结

QAT 强但有成本，STE 偏差与训练稳定性是主要挑战，混合策略与渐进量化更稳妥。
