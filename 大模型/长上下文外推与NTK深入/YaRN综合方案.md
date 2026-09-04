# YaRN综合方案

> 对应 Peng et al., 2023 *YaRN: Efficient Context Window Extension of Large Language Models*。

## 一、背景与挑战
PI 与 NTK 各有局限。YaRN 结合两者，并引入注意力温度因子，在 13B 模型上把 4k 上下文扩到 128k。

## 二、核心原理
三个组件：
1. 长度缩放：位置 $m$ 缩放为 $m/\sqrt{1/t}$，其中 $t$ 是温度。
2. 注意力温度：$1/t$ 因子作用于 $\text{softmax}(QK^\top / (t \sqrt d))$。
3. NTK-by-parts：不同维度用不同策略（高频不缩、中频 NTK、低频 PI）。

## 三、形式化与数学基础
$ t = 0.1 \ln s + 1 $（经验公式）。YaRN 用 $r(d) = f(d) \cdot (1-\gamma) + \gamma$ 的 ramp 函数区分维度。

## 四、代码实现
```python
def yarn_get_mask(dim, s):
    # 区分高频/中频/低频
    ...
def yarn_scale(q, k, t):
    return (q @ k.transpose(-1,-2)) / (t * math.sqrt(head_dim))
```

## 五、与其他技术对比
- vs PI/NTK：YaRN 多一个温度因子，分布更稳定。
- vs Code Llama：YaRN 无需特殊预训练，推理侧扩展。

## 六、常见误区
- 温度因子仅对长序列显著。
- 需小量微调才能达到最佳效果。

## 七、与开源书/权威来源对应
- jquesnelle/yarn 仓库。
- huggingface/transformers YaRN 实现。

## 八、面试题
- YaRN 与 NTK 关键区别？答：YaRN 加温度因子，区分频率策略。

## 九、演进与趋势
PI → NTK → YaRN → 持续预训练（Code Llama 100k）。

## 十、小结
YaRN 是 RoPE 长上下文外推的工业级方案，结合缩放、频率、注意力温度。
