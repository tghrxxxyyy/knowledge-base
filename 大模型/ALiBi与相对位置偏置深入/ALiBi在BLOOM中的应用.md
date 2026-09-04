# ALiBi在BLOOM中的应用

> 对应 bigscience/bloom 训练配置；Scao 2022 *BLOOM*。

## 一、背景与挑战
BLOOM（176B）选择 ALiBi 作为位置编码，目的是支持 2k 训练、推理扩展到更长的能力。

## 二、核心原理
BLOOM 的 176B 模型用 112 个头，斜率按 $m_r = 2^{-8/r}$ 设置。所有头共享同一偏置模式，模型通过训练学会使用不同尺度。

## 三、形式化与数学基础
BLOOM 实现中 ALiBi 偏置在 attention 分数上，矩阵大小 $(L, L)$，每个头乘以不同斜率。实现见 `transformers/models/bloom/modeling_bloom.py` 的 `build_alibi_tensor`。

## 四、代码实现
```python
def build_alibi_tensor(attention_mask, n_heads, dtype):
    # 计算距离并按斜率缩放
    ...
```

## 五、与其他技术对比
- vs LLaMA RoPE：ALiBi 无需学习位置参数。
- vs T5 相对偏置：T5 用桶化相对距离，ALiBi 用连续距离。

## 六、常见误区
- 误以为 BLOOM 训练长度就是 2k；实际 BLOOM 是 2k 训练后外推到 1k-8k。
- 斜率序列与头数不匹配时输出会出错。

## 七、与开源书/权威来源对应
- bigscience/bloom 仓库。
- huggingface/transformers BLOOM 实现。

## 八、面试题
- BLOOM 为何选 ALiBi 而非 RoPE？答：希望训练短测试长的外推能力。

## 九、演进与趋势
BLOOM ALiBi → BLOOMZ 指令微调 → 后续 BLOOM 变体。

## 十、小结
BLOOM 的 ALiBi 实践是工业级外推方案的代表。
