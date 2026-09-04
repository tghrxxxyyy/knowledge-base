# SmoothQuant数学推导与平滑因子

> 对应 Xiao 2023 SmoothQuant 的平滑因子推导与 huggingface/transformers 量化工具。

## 一、背景与挑战

如何把激活的量化难度转移到权重？需要确定每通道的缩放因子 $ s_j $，使缩放后权重与激活的量化误差都下降。

## 二、核心原理

对线性层 $ Y=XW $，引入对角矩阵 $ S=\\text{diag}(s) $：

$ Y=(XS^{-1})(SW) $

令 $ \\tilde X=XS^{-1},\\tilde W=SW $，前向不变。选 $ s_j $ 使 $ \\tilde X,\\tilde W $ 的量化难度均衡。

## 三、形式化与数学基础

平滑因子定义：

$ s_j=\\frac{\\max(|X_j|)^\\alpha}{\\max(|W_j|)^{1-\\alpha}} $

$ \\alpha\\in[0,1] $ 控制偏向：越大越把难度移到权重。$ \\tilde X_j=X_j/s_j,\\tilde W_j=s_j W_j $。

## 四、代码实现

```python
import torch

def smooth(W, X, alpha=0.5):
    xmax = X.abs().max(dim=0).values          # 每通道激活最大
    wmax = W.abs().max(dim=1, keepdim=True).values  # 每输出通道权重最大
    s = (xmax ** alpha) / (wmax.squeeze() ** (1 - alpha) + 1e-12)
    s = s.clamp(min=1e-4)
    Wt = W * s[None, :]
    Xt = X / s[None, :]
    return Wt, Xt, s
```

## 五、与其他技术对比

- 与 AWQ 同属权重-激活均衡，但 SmoothQuant 主打 W8A8。
- GPTQ 不经此变换，直接权重重建。

## 六、常见误区

- alpha 取 0 或 1 极端值，平滑失效。
- 跨层用同一 s，忽略每层分布不同。

## 七、与开源书/权威来源对应

- Xiao et al. 2023, SmoothQuant.
- huggingface/transformers: https://github.com/huggingface/transformers
- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM

## 八、面试题

- 平滑因子公式如何平衡权重与激活？
- alpha 的作用与取值范围？
- 为何变换不改变前向结果？

## 九、演进与趋势

自动搜索 alpha、逐层差异化与硬件 FP8 融合是演进方向。

## 十、小结

SmoothQuant 用可解析的平滑因子把激活离群难度转移到权重，实现高精度 W8A8。
