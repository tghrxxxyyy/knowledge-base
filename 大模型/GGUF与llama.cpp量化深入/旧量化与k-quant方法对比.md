# 旧量化与k-quant方法对比

> 对应 ggerganov/llama.cpp 中 Q4_0/Q5_0/Q8_0 与 Q4_K/Q5_K/Q6_K 的对比文档。

## 一、背景与挑战

llama.cpp 长期提供 Q4_0/Q5_0/Q8_0 等均匀量化，k-quant 系列在相近体积下精度更好。理解差异有助于选型。

## 二、核心原理

均匀量化 (Qn_0) 全张量单一 scale；k-quant 引入 super-block 与 sub-block 双重 scale，对数值范围变化大的权重更友好。

## 三、形式化与数学基础

均匀 Q4_0：

$ \\hat w = s\\cdot q,\\quad q\\in[0,15] $

k-quant 见前文超块公式，多出的 sub-block scale 用少量 bit 表达，整体 bit/权重略升但误差下降。

## 四、代码实现

```python
def choose_quant(perplexity_fn, model):
    for name in ["Q4_0", "Q4_K_M", "Q5_K_M", "Q8_0"]:
        ppl = perplexity_fn(quantize(model, name))
        print(name, "ppl=", ppl)
    # 通常 Q4_K_M 在体积/精度上最优
```

## 五、与其他技术对比

- Q8_0 近无损但体积大；Q4_0 最小但精度弱。
- Q4_K_M 常是默认推荐。

## 六、常见误区

- 认为位宽越低越差，忽略 k-quant 的结构优势。
- 用旧 Q4_0 与新 Q4_K 直接比体积却期望同精度。

## 七、与开源书/权威来源对应

- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- 为什么 Q4_K_M 比 Q4_0 好？
- 何时应选 Q8_0？
- k-quant 的额外开销在哪？

## 九、演进与趋势

imatrix (重要性矩阵) 引导量化进一步缩小与 PTQ 专用方法的差距。

## 十、小结

k-quant 以结构化混合精度在相同体积下显著提升精度，是旧均匀量化的升级替代。
