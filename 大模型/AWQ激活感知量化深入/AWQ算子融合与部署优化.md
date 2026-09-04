# AWQ算子融合与部署优化

> 对应 Lin 2023 AWQ 的 TinyChat 部署与 NVIDIA/TensorRT-LLM 的量化融合。

## 一、背景与挑战

AWQ 在权重侧引入缩放因子，若不在 kernel 中融合，反缩放会带来额外访存与计算。部署优化需把缩放吸收进矩阵乘。

## 二、核心原理

推理时 $ Y=X\\hat W^T $。AWQ 等价于把缩放 $ s $ 吸收进权重或激活：要么在权重反量化时乘 $ s $，要么在激活前除 $ s $，二者融合进 GEMM/epilog 避免额外 pass。

## 三、形式化与数学基础

量化权重 $ \\hat W $ 反量化得 $ \\tilde W=\\text{diag}(s)^{-1}\\hat W_{deq} $，于是

$ Y=X\\tilde W^T = (X\\text{diag}(s)^{-1})\\hat W_{deq}^T $

缩放可前移到激活预处理，仅在每层一次。

## 四、代码实现

```python
# 伪代码: 融合反量化与 GEMM (概念)
def awq_gemm(X, qweight, scales, zp, s):
    Xs = X / s                      # 激活侧吸收缩放
    out = torch.functional.linear(Xs, dequant(qweight, scales, zp))
    return out
# 实际由 TensorRT-LLM / llama.cpp 的 fused kernel 完成
```

## 五、与其他技术对比

- GPTQ 同样需融合反量化；AWQ 多了一次激活缩放，但可合并。
- GGUF 的 k-quant 走不同融合路径。

## 六、常见误区

- 在 Python 层做显式反缩放，导致性能腰斩。
- 忽略 per-group 缩放与 GEMM tile 的对齐。

## 七、与开源书/权威来源对应

- Lin et al. 2023, AWQ (TinyChat).
- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp

## 八、面试题

- AWQ 的缩放在推理哪一步被吸收？
- 为什么必须 kernel 融合？
- 融合失败会怎样影响吞吐？

## 九、演进与趋势

随 FP8/INT4 Tensor Core 普及，缩放融合将下沉到硬件指令层。

## 十、小结

AWQ 部署的关键是算子融合：把通道缩放吸收进 GEMM，避免额外开销。
