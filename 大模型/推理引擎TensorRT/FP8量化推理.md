# FP8 量化推理

> 对应 NVIDIA Hopper 架构 FP8 Tensor Core 与 Microncaling（MXFP8）格式，及 TensorRT-LLM FP8 支持。

## 一、背景与挑战

大模型权重与激活多为 FP16/BF16，推理时频繁读写 HBM 使解码呈 memory-bound。降低数值精度可直接减半甚至更多访存量与算力开销。INT8 虽省带宽但**对称整数**对动态范围大的激活不友好，易损精度。FP8 以 8 位浮点保留指数位，兼顾「省一半带宽」与「接近浮点的动态范围」，在 Hopper（H100/H200）上有原生 Tensor Core 支持，成为生产部署首选低损量化。

## 二、核心原理

FP8 主要有两种格式：**E4M3**（4 位指数、3 位尾数，动态范围适中、精度高，用于权重/激活）与 **E5M2**（5 位指数、2 位尾数，动态范围大，用于梯度/特殊场景）。推理常用 E4M3。TRT-LLM 支持 **FP8 权重 + FP8 激活**（即 FP8 GEMM），并在反量化时把缩放因子并入，保持输出尺度正确。

实现要点：用校准（calibration）或静态统计确定每层激活的缩放因子 $s$，前向计算：

$$Y \approx \text{dequant}\big(\text{quant}(X, s_x) \cdot \text{quant}(W, s_w)\big).$$

由于浮点指数位保护了动态范围，多数任务精度损失远小于 INT8，常可视为「近无损」。

## 三、形式化与数学基础

FP8(E4M3) 可表示约 $[-448, 448]$，最小正规格约 $2^{-9}$。量化：

$$x_{\text{fp8}} = \text{round}\!\left(\frac{x}{s}\right),\qquad \hat x = x_{\text{fp8}} \cdot s,$$

其中缩放 $s$ 通常取 $\max|x| / 448$。GEMM 输出误差由 Montgomery 式近似：

$$\widehat{ XW } = (s_x s_w)\cdot \big(\tilde X \tilde W\big),$$

$s_x s_w$ 为反量化系数。带宽收益：FP8 相比 FP16 权重访存减半，Hopper FP8 Tensor Core 峰值算力约为 FP16 的 2 倍。

## 四、代码实现

TRT-LLM 构建开启 FP8：

```bash
trtllm-build --checkpoint_dir ./ckpt \
  --output_dir ./engine_fp8 \
  --quant_fp8 \
  --gemm_plugin fp8
```

也可在 Python API 指定量化配方（以官方最新文档为准）：

```python
from tensorrt_llm.quantization import QuantMode
# 构建时传入 quant_mode 包含 FP8 标志（具体 API 以官方为准）
```

## 五、与其他精度对比

| 精度 | 带宽 | Hopper 原生 | 典型质量 |
|------|------|------------|---------|
| FP16/BF16 | 基准 | 是 | 基准 |
| FP8(E4M3) | 1/2 | 是 | 近无损 |
| INT8 | 1/2 | 是 | 略损 |
| INT4(weight) | 1/4 | 否(需模拟) | 明显压缩 |

## 六、常见误区

- **以为 FP8 完全无损**：绝大多数任务近无损，但极小模型或极敏感层仍可能掉点，需验证。
- **在老硬件用 FP8**：Ampere 及更早无 FP8 Tensor Core，会回退或报错。
- **只量化权重忽略激活**：激活动态范围大，仅权重量化收益受限，FP8 通常权重+激活一起。
- **不做校准/统计**：缩放因子取错会严重削精度，应按层统计实际分布而非拍脑袋。
- **以为所有层同损**：注意力 softmax 前后、LayerNorm 输出等数值敏感处，宜保留更高精度或回退。

## 七、与开源书·权威来源对应

- NVIDIA *Hopper Architecture* 白皮书（FP8 Tensor Core）。
- NVIDIA TensorRT-LLM 量化文档（含 FP8 / W4A16 / W8A8）。
- Microscaling Formats（MXFP8）规范，OCP。

## 八、面试题

- FP8 相比 INT8 为何精度更好？指数位的作用是什么？
- E4M3 与 E5M2 区别与用途？
- 为什么 FP8 推理需要 Hopper 及以后架构？

## 九、演进与趋势

精度继续下探：FP8 → **FP4**（Blackwell 原生）、NVFP4；以及 **MXFP6/MXFP4** 微缩放格式标准化；混合精度（敏感层留 FP16）成为默认策略。结合稀疏化（2:4 sparsity）进一步提算力。

## 十、小结

FP8 用 8 位浮点（E4M3 为主）在 Hopper 原生 Tensor Core 上把权重/激活访存与算力约减半，因保留指数位而近无损，是生产低损量化的首选；前提是硬件支持并按层校准缩放因子，敏感层可回退 FP16。
