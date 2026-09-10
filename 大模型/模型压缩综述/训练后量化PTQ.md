# 训练后量化 PTQ

> 对应 Frantar et al. 2022 GPTQ 与雅可比/标定（calibration）经典方法。

## 一、背景与挑战

训练后量化（Post-Training Quantization, PTQ）指在不重新训练模型的前提下，用一小批「标定数据（calibration data）」估计量化参数（scale、zero-point），将权重与激活从 FP16/FP32 直接映射到 INT8/INT4。它的巨大优势是成本低——不必动用完整训练集群，几小时内即可量化一个大模型。挑战在于：低比特（尤其 4-bit 以下）会因舍入误差累积而显著掉点；激活的分布可能长尾、含离群值（outlier），固定量化范围会把这些极端值「压扁」导致严重误差；此外量化粒度（per-tensor / per-channel / per-group）直接决定精度与开销。工程上，PTQ 常作为「上线前的快速验证」：先 PTQ 看是否满足精度，不满足再投入 QAT，形成成本递增的决策链。PTQ 还有一个常被忽视的环节——「偏置校正（bias correction）」：量化会系统性偏移激活均值，对后续层 bias 做补偿可显著恢复精度，尤其在 4-bit 以下。

## 二、核心原理

PTQ 流程通常为：① 收集具代表性的标定样本（覆盖真实输入分布）；② 前向统计各层激活/权重的分布（min/max 或分位数）；③ 选择量化粒度——per-tensor（整层一个 scale，简单但粗）、per-channel（每输出通道一个，更准）、per-group（每若干元素一组，最细，AWQ/GPTQ 常用）；④ 计算映射参数并量化。为缓解离群值，常用「缩放 + 偏移」或按组归一化。GPTQ 进一步在量化同时做「逐列补偿」，把前一层量化误差通过 Hessian 反向分摊到后续权重，使 4-bit 仍保高精度。标定数据的质量直接决定量化范围是否准确，是 PTQ 成败的关键。

## 三、形式化与数学基础

均匀量化将实数 $x$ 映射到整数：

$$q = \text{clip}\left(\left\lfloor\frac{x}{s}\right\rceil + z, 0, 2^b-1\right),\quad s = \frac{\max-\min}{2^b-1}$$

反量化近似 $\hat x = s(q-z)$。对权重分组量化（group size $g$）时，每 $g$ 个元素共享 $s,z$，误差上界：

$$|x - \hat x| \le \frac{s}{2} = \frac{\max_g-\min_g}{2(2^b-1)}$$

分组越细（g 越小），每组动态范围越窄，舍入误差越小，但需存储更多 $s,z$，带来开销。偏置校正则估计量化前后激活均值差 $\Delta\mu$ 并补偿到后续 bias。

## 四、代码实现

```python
import torch

def quantize_weight(W: torch.Tensor, bits=4, group=128):
    # per-group 对称量化（示意）
    qmax = 2 ** bits - 1
    W = W.float()
    out = torch.zeros_like(W, dtype=torch.int8)
    scales = []
    for g in range(0, W.numel(), group):
        block = W.flatten()[g:g+group]
        s = block.abs().max() / (qmax / 2)
        q = (block / s).round().clamp(-qmax//2, qmax//2)
        out.flatten()[g:g+block.numel()] = q.to(torch.int8)
        scales.append(s)
    return out, torch.stack(scales)   # 反量化: W_hat = out * s
```

## 五、与其他技术对比

| 方法 | 精度 | 成本 | 数据需求 |
|------|------|------|----------|
| PTQ | 中/高 | 低 | 少量标定 |
| QAT | 高 | 高 | 全训练集 |
| 动态量化 | 中 | 极低 | 无标定 |

PTQ 是成本与精度的最佳折中起点，适合快速部署。

## 六、常见误区

- 标定数据不具代表性：分布偏移使量化范围错配，精度崩坏。
- 忽视激活离群值：少数极端值撑大范围，压低正常值分辨率。
- 认为 per-tensor 足够：大模型权重通道异质，per-channel/per-group 必要。
- 量化后不验证任务：只看显存下降，忽略下游掉点。

## 七、与开源书·权威来源对应

- Frantar et al., *GPTQ: Accurate Post-Training Quantization for LLMs* (2022) 提出逐列补偿的 4-bit 量化。
- 经典 PTQ 标定思想源自 Jacob et al. 2017 量化的标定流程。
- 工具链：AutoGPTQ、llm-compressor、torch.ao，以官方最新文档为准。

## 八、面试题

1. per-channel 与 per-tensor 量化的差异与取舍？
2. PTQ 为何需要标定数据？数据不具代表性会怎样？
3. group size 越小精度为何更好但开销更大？
4. GPTQ 相比朴素 PTQ 做了什么改进？
5. 偏置校正（bias correction）解决什么问题？

## 九、演进与趋势

- 从 INT8/INT4 走向更低比特（2-3 bit）与混合精度。
- 激活量化与 KV cache 量化结合，长上下文收益显著。
- 量化与稀疏、低秩联合的「一体化压缩」成为部署主流。
- 免标定（calibration-free）量化研究兴起，降低对代表数据的依赖。

- 旋转式量化（如 QuaRot/RoPE 旋转）缓解激活离群值，使 2-bit 可行。
- 仅权重（weight-only）量化与权重+激活量化在部署上分工明确。
- 量化感知的推理引擎自动选择 per-group 粒度以平衡精度与开销。
- 低比特训练（Forward/Backward 量化）进一步压缩训练成本。
- 社区基准（如 Quantization Arena）推动方法间公平对比。

## 十、小结

PTQ 以极低成本把模型压到低比特，关键是代表性的标定数据与合理的量化粒度（per-group 常用）。它需妥善处理激活离群值与误差补偿（如 GPTQ、bias correction），并在量化后以任务指标验证，而非只看显存下降。
