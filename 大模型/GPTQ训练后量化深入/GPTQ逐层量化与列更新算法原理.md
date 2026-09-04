# GPTQ逐层量化与列更新算法原理

> 对应 Frantar 2022 GPTQ (arXiv:2210.17323) 与 ggerganov/llama.cpp 的量化实现。

## 一、背景与挑战

大模型权重占据主要显存，INT8/INT4 量化是部署落地的关键手段。朴素 rounding-to-nearest (RTN) 在 4bit 下精度崩塌，原因在于权重各列对输出误差的贡献不均匀。GPTQ 提出在训练后量化 (PTQ) 阶段利用二阶信息，按列顺序量化并即时补偿后续列，逼近最优量化矩阵。

## 二、核心原理

GPTQ 将层输出重建问题分解为逐列更新：对第 j 列做量化后，用其量化误差去修正尚未量化的剩余列，使重建损失 $ \\|WX-\\hat W X\\|_F^2 $ 最小。它本质上是 OBQ (Optimal Brain Quantization) 的可扩展近似，把 $ O(d^3) $ 复杂度降到可实用级别。

## 三、形式化与数学基础

给定激活 $ X\\in\\mathbb R^{d\\times n} $，量化目标为

$ \\min_{\\hat W} \\|WX-\\hat W X\\|_2^2 $

引入 Hessian $ H=XX^\\top+\\lambda I $。对第 j 列量化误差 $ \\delta_j=\\hat w_j-w_j $，补偿量按 $ \\Delta_{:>j}=-H^{-1}_{:>j,j}\\delta_j/H_{j,j} $ 施加到后续列，使得该列的贡献被精确抵消。

## 四、代码实现

```python
import torch

def gptq_quantize_column(W, H, j, bits=4):
    # W: [out, in]; H: 二阶信息矩阵 [in, in]
    qmax = 2 ** bits - 1
    w = W[:, j].clone()
    scale = w.abs().max() / qmax
    q = torch.clamp(torch.round(w / scale), -qmax, qmax)
    err = (q - w) * scale
    # 用 H 的列方向信息补偿后续列
    damp = H[:, j] / (H[j, j] + 1e-12)
    W[:, j+1:] -= damp[:, None] * err[None, :]
    return q, scale

# 逐列扫描，blocksize 控制分块以兼顾数值稳定
def gptq_layer(W, H, blocksize=128, bits=4):
    Q = W.clone()
    for b in range(0, W.shape[1], blocksize):
        for j in range(b, min(b+blocksize, W.shape[1])):
            q, s = gptq_quantize_column(Q, H, j, bits)
            Q[:, j] = q * s
    return Q
```

## 五、与其他技术对比

- 相比 RTN：GPTQ 用二阶补偿显著降低 4bit 重建误差。
- 相比 AWQ：GPTQ 改权重本身，AWQ 通过通道缩放保留显著权重；二者可叠加。
- 相比 QAT：GPTQ 无需训练前向，成本更低但低比特上限略逊。

## 六、常见误区

- 认为 GPTQ 等价于逐列独立量化；实际上补偿步骤才是精度来源。
- 忽略 act-order（按 Hessian 对角排序）对数值稳定的作用。
- 在 group_size 过大时仍强行 4bit，可能反超 RTN 误差。

## 七、与开源书/权威来源对应

- Frantar et al. 2022, GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers.
- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- GPTQ 为什么能比 RTN 在低比特下更准？二阶补偿的作用是什么？
- act-order 解决了什么数值问题？
- GPTQ 与 AWQ 能否结合使用？

## 九、演进与趋势

GPTQ 催生了 EXL2、GPTQModel 等后续工具，并向混合精度、稀疏-量化联合方向演进。近期工作把 Hessian 估计与校准集选择进一步自动化。

## 十、小结

GPTQ 以可扩展的逐列二阶补偿，在 PTQ 阶段把 4bit 量化做到可用，是当前 LLM 压缩部署的事实标准之一。
