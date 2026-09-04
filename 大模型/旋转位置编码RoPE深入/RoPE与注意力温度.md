# RoPE与注意力温度

> 对应 bloc97/ntk-aware scaled rope 后续; Peng 2023 YaRN。

## 一、背景与挑战
RoPE 缩放后注意力分数的分布可能改变（点积尺度变化），需调整温度因子 $\tau$ 来恢复原分布的尖锐度。

## 二、核心原理
YaRN 引入 attention scaling $1/t$ 因子（$t = \sqrt{0.1 \ln s + 1}$，$s$ 为缩放比），让 $\text{softmax}(QK^\top / (\tau \sqrt d))$ 的输出分布接近未缩放时。

## 三、形式化与数学基础
$ t = \sqrt{(1/d) \sum_i (1-1/\theta_i^2)} $ 之类的修正项，使缩放后内积的方差保持近似一致。YaRN 给出简化 $t = 0.1 \ln s + 1$ 的经验式。

## 四、代码实现
```python
# YaRN attention scaling
s = max_seq / train_seq
t = 0.1 * math.log(s) + 1.0
attn = (q @ k.transpose(-1,-2)) / (t * math.sqrt(head_dim))
attn = attn.softmax(-1)
```

## 五、与其他技术对比
- vs 单纯位置插值：YaRN 温度修正使分布更稳定。
- vs ALiBi：两者都在调整注意力分布，但机制不同。

## 六、常见误区
- 温度因子仅在长序列下显著，短序列无需调整。
- 不同头可能需要不同温度，但实践中统一应用即可。

## 七、与开源书/权威来源对应
- jquesnelle/yarn 仓库。
- huggingface/transformers 中 YaRN 实现。

## 八、面试题
- 为什么缩放后需要温度调整？答：位置缩放改变了内积尺度，使 softmax 分布变平。

## 九、演进与趋势
RoPE → PI/NTK → YaRN（缩放+温度）。

## 十、小结
YaRN 引入温度因子修正注意力分布，是 RoPE 长上下文外推的工业级方案。
