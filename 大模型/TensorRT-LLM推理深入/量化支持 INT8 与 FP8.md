# 量化支持 INT8 与 FP8

> 对应 Lin 2023 AWQ; Frantar 2022 GPTQ; NVIDIA/TensorRT-LLM。

## 一、背景与挑战
大模型权重与激活占显存与带宽，量化可减少一半甚至更多，代价是精度损失。

## 二、核心原理
TRT-LLM 支持 weight-only（INT4/INT8）与激活-权重联合（FP8）量化。FP8 利用 Hopper 张量核心，几乎无损且显著提速。

## 三、形式化与数学基础
对称量化：
$ \hat{w} = \text{round}(w / s),\quad s = \max(|w|)/q_{max} $
反量化为 \hat{w}·s。FP8 直接以 E4M3 表示激活。

## 四、代码实现
```python
from tensorrt_llm.quantization import quantize
model = quantize(model, quant_mode="FP8")   # 或 "W4A16"
engine = build(model)
```

## 五、与其他技术对比
GPTQ/AWQ 是训练后权重量化；TRT-LLM 在引擎内原生支持并把量化融入融合核。

## 六、常见误区
误区：INT4 总可用。激活敏感层需保留高精度，否则崩坏。

## 七、与开源书/权威来源对应
Lin et al. 2023 AWQ; Frantar et al. 2022 GPTQ。见 NVIDIA/TensorRT-LLM。

## 八、面试题
问：FP8 为何适合推理？
答：张量核心原生支持，精度足够且带宽减半，延迟大降。

## 九、演进与趋势
混合精度逐层搜索量化配置成为标准流程。

## 十、小结
量化是 TRT-LLM 提升吞吐、降显存的主手段，FP8 尤具性价比。
