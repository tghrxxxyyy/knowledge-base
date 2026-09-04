# AdamW在Transformer预训练中的实践

> 对应 karpathy/nanoGPT 与 huggingface/transformers 的优化器配置。

## 一、背景与挑战
Transformer 参数以矩阵为主，且含大量 bias 与 LayerNorm/RMSNorm 参数。直接全量衰减会损害稳定性，需要精细的参数分组策略。

## 二、核心原理
工程惯例：对权重矩阵施加权重衰减，对 bias、归一化层、以及部分 embedding 关闭衰减。学习率常配合余弦退火与线性预热，β 取 (0.9, 0.95)，ε 取 1e-8 或 1e-15。

## 三、形式化与数学基础
参数分组后更新为：

$ \theta_{w} \leftarrow (1-\eta\lambda)\theta_w - \eta \hat m_w/\sqrt{\hat v_w} $

$ \theta_{nb} \leftarrow \theta_{nb} - \eta \hat m_{nb}/\sqrt{\hat v_{nb}} $

其中 w 为可衰减权重，nb 为不衰减项。

## 四、代码实现
```python
from torch.optim import AdamW
def grouped_optimizer(model, lr=3e-4, wd=0.1):
    decay, no_decay = [], []
    for name, p in model.named_parameters():
        if not p.requires_grad:
            continue
        if name.endswith("bias") or "norm" in name or "layernorm" in name:
            no_decay.append(p)
        else:
            decay.append(p)
    return AdamW([{"params": decay, "weight_decay": wd},
                  {"params": no_decay, "weight_decay": 0.0}], lr=lr)
```

## 五、与其他技术对比
相比 Adafactor 等内存友好优化器，AdamW 占用更多显存（需保存 m、v），但实现简单、生态成熟，是大模型主流选择。

## 六、常见误区
把 wd 设得过大（如 0.1 用于小数据）会过度收缩参数；在小数据集上应减小到 0.01 甚至 0。

## 七、与开源书/权威来源对应
karpathy/nanoGPT 使用 `AdamW(lr=3e-4, betas=(0.9,0.95), weight_decay=0.1)`；huggingface/transformers 提供 `get_linear_schedule_with_warmup`。

## 八、面试题
问：为什么 bias 通常不衰减？答：bias 参数数量少且影响偏移，衰减它们收益低且可能损害收敛。

## 九、演进与趋势
随着 8 比特优化器与 Lion 出现，AdamW 的显存占用受到挑战，但其鲁棒性仍难替代。

## 十、小结
分组衰减 + 合适超参是 Transformer 稳定预训练的关键工程经验。
