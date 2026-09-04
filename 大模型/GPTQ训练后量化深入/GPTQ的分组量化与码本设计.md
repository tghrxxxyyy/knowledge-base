# GPTQ的分组量化与码本设计

> 对应 Frantar 2022 GPTQ 与 NVIDIA/TensorRT-LLM 的 INT4 分组量化实现。

## 一、背景与挑战

整张权重矩阵共用一个 scale 会放大量化误差，尤其当权重数值范围跨度大时。分组 (group) 量化把矩阵按行/列分块，每块独立 scale/zero-point，在开销与精度间取得平衡。

## 二、核心原理

GPTQ 通常对每 $ g $ 个连续通道（如 g=128）共享一个量化参数。更激进的矢量量化 (vector quantization) 用码本 (codebook) 表示一组权重，用索引代替数值，进一步压缩。

## 三、形式化与数学基础

分组量化：

$ \\hat w_{i}=s_k\\cdot q_{i}+z_k,\\quad k=\\lfloor i/g\\rfloor $

矢量量化用码本 $ C=\\{c_1,\\dots,c_m\\} $：

$ \\hat w_{i}=C[\\text{idx}_i],\\quad \\text{idx}_i=\\arg\\min_c \\|w_i-c\\| $

## 四、代码实现

```python
import torch

def grouped_quant(W, g=128, bits=4):
    qmax = 2 ** bits - 1
    out, scales, zeros = [], [], []
    for i in range(0, W.shape[1], g):
        blk = W[:, i:i+g]
        s = blk.abs().max(dim=0, keepdim=True).values / qmax
        z = torch.round(-blk.min(dim=0, keepdim=True).values / s)
        q = torch.clamp(torch.round(blk / s) + z, 0, qmax)
        out.append(q); scales.append(s); zeros.append(z)
    return torch.cat(out, 1), torch.cat(scales, 1), torch.cat(zeros, 1)
```

## 五、与其他技术对比

- group_size 越小精度越高，但反量化查表开销增大。
- 矢量量化压缩率更高，但 kernel 实现复杂，推理吞吐受限。
- AWQ 也用 group 量化，只是额外引入通道缩放。

## 六、常见误区

- 认为 group=1 必然最优；过小会显著拖慢推理。
- 码本训练若校准集不足，泛化差。
- 忽略反量化在 GPU kernel 中的融合必要性。

## 七、与开源书/权威来源对应

- Frantar et al. 2022, GPTQ.
- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- 为什么分组量化能改善 INT4 精度？
- group_size 对推理速度有何影响？
- 矢量量化相比标量量化的优劣？

## 九、演进与趋势

GPTQModel 等工具把分组与混合精度、稀疏结合；K-means 码本量化在端侧继续演进。

## 十、小结

分组与码本是 GPTQ 落地 4bit 的工程化关键，需在精度、压缩率、kernel 效率间权衡。
