# AWQ低比特INT3与INT4实践

> 对应 Lin 2023 AWQ 的低比特实验与 huggingface/transformers 的 4bit 加载。

## 一、背景与挑战

4bit 是 AWQ 的主战场，3bit 进一步压缩但风险更高。实践中需权衡精度与显存，并在关键层保留更高位宽。

## 二、核心原理

AWQ 在 3/4bit 下通过激活感知缩放保护显著通道，配合 group_size=128 的细粒度量化，使低比特可用。必要时对注意力相关投影保留 8bit。

## 三、形式化与数学基础

细粒度分组量化：

$ \\hat w_i = \\text{round}(s_k^{-1}\\tilde w_i) \\cdot s_k,\\quad k=\\lfloor i/g\\rfloor $

AWQ 缩放 $ \\tilde w $ 后再分组量化，显著降低重要通道的相对误差。

## 四、代码实现

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
# AWQ 权重由离线工具产出, 推理用对应 loader
cfg = {"w_bit": 4, "q_group_size": 128, "zero_point": True}
# 伪: model = load_awq("model-awq-4bit", cfg)
print("4bit AWQ + group128 是常见默认配置")
```

## 五、与其他技术对比

- 3bit AWQ 比 3bit GPTQ 常更稳，但均弱于 4bit。
- GGUF Q4_K 与之精度接近，生态不同。

## 六、常见误区

- 盲目 3bit 期待无损；低比特必有退化。
- group_size 设太大导致 4bit 失效。

## 七、与开源书/权威来源对应

- Lin et al. 2023, AWQ.
- huggingface/transformers: https://github.com/huggingface/transformers
- mit-han-lab/llm-awq: https://github.com/mit-han-lab/llm-awq

## 八、面试题

- 4bit 与 3bit AWQ 如何取舍？
- group_size 对 AWQ 低比特的影响？
- 哪些层应保留高位宽？

## 九、演进与趋势

AWQ 与混合精度、稀疏协同，向 3bit 可用化推进。

## 十、小结

AWQ 在 4bit 表现成熟，3bit 需配合细分组与混合精度方能实用。
