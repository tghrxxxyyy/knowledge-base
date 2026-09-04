# SwiGLU与GeGLU对比

> 对应 Shazeer 2020 论文实验。

## 一、背景与挑战
GLU 变体有 SwiGLU、GeGLU、ReGLU 等，它们用不同激活函数 $\sigma$ 替代 sigmoid。如何选择？

## 二、核心原理
- SwiGLU: $\text{SwiGLU}(x) = (W_1 x) \odot \text{SiLU}(W_2 x)$，SiLU = $x \cdot \text{sigmoid}(x)$。
- GeGLU: $\text{GeGLU}(x) = (W_1 x) \odot \text{GELU}(W_2 x)$。
- ReGLU: $\text{ReGLU}(x) = (W_1 x) \odot \text{ReLU}(W_2 x)$。

## 三、形式化与数学基础
Shazeer 2020 实验显示 SwiGLU 与 GeGLU 表现相当，ReGLU 略差。三者都使用门控思想，区别在于门控分支的激活函数光滑性。

## 四、代码实现
```python
# SwiGLU
def silu(x): return x * torch.sigmoid(x)
out = (W1(x) * silu(W2(x))) @ W3
```

## 五、与其他技术对比
- SwiGLU：门控分支用 SiLU，平滑且非单调。
- GeGLU：门控分支用 GELU，与 BERT 一致。
- ReGLU：最简单但表现略差。

## 六、常见误区
- 用 sigmoid 而非 SiLU/GELU 会损失表达能力。
- 不缩放 $d_\text{ffn}$ 时参数更多，需相应调小 $d_\text{ffn}$。

## 七、与开源书/权威来源对应
- meta-llama/llama 官方实现。
- google-research/gemma SwiGLU 实现。

## 八、面试题
- LLaMA 为何选 SwiGLU？答：Shazeer 实验中 SwiGLU 在多种任务上稳定最优。

## 九、演进与趋势
GELU → SwiGLU → 混合专家（MoE）+ SwiGLU。

## 十、小结
SwiGLU 是当前 LLM 的主流选择，与 GeGLU 表现接近，参数一致。
