# KV压缩量化与PagedAttention

> 对应 Kwon 2023 vLLM PagedAttention; KV Quantization (Hooper 2024)。

## 一、背景与挑战
长上下文 + 大并发时 KV Cache 显存成为瓶颈。PagedAttention 把 KV 切成页减少碎片，KV 量化进一步压缩显存。

## 二、核心原理
PagedAttention：KV 按 block 存储，逻辑 token 经块表映射到物理 block。
KV 量化：把 K/V 量化为 INT8/INT4/FP8，显存降 2-4x，精度损失可控。

## 三、形式化与数学基础
FP8 量化：$V_q = \text{round}(V / s) + z$，$s$ 是 scale，$z$ 是 zero-point。反量化 $V \approx (V_q - z) \cdot s$。

## 四、代码实现
```python
# FP8 KV 量化
def quantize_kv(k, v):
    s = k.abs().max() / 448.0
    return (k/s).to(torch.float8_e4m3fn), s
def dequantize(kq, s):
    return kq.to(torch.float32) * s
```

## 五、与其他技术对比
- vs 淘汰：量化保留所有 token，淘汰减少 token。
- vs 滑动窗口：量化保真度高于简单截断。

## 六、常见误区
- 量化需注意力 kernel 配合，普通 kernel 不支持。
- INT4 精度损失大，需训练感知量化。

## 七、与开源书/权威来源对应
- vllm-project/vllm。
- Dao-AILab/flash-attention FP8 模式。
- d2l-ai/d2l-zh。

## 八、面试题
- PagedAttention 节省多少显存？答：碎片化场景下可达 4 倍以上。

## 九、演进与趋势
PagedAttention → KV 量化 → KV 共享（跨请求）→ 分布式 KV。

## 十、小结
PagedAttention 与 KV 量化是长上下文推理的工程基石。
