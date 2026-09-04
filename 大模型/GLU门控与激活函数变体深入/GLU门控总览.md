# GLU门控总览

> 对应 Shazeer 2020 *GLU Variants Improve Transformer*; Dauphin et al. 2017 (原始 GLU)。

## 一、背景与挑战
Transformer FFN 子层是 $W_2 \sigma(W_1 x)$。把 $\sigma$ 替换为门控机制可显著提升效果。GLU 及其变体是现代 LLM 的标准选择。

## 二、核心原理
GLU(x) = (W_1 x) \odot \sigma(W_2 x)，其中 $\sigma$ 是 sigmoid。门控 $W_2 x$ 控制 $W_1 x$ 的通过。扩展为多头：把 $W_1, W_2$ 输出维度分成 $k$ 份，每份独立做 GLU。

## 三、形式化与数学基础
$ \text{FFN}_{\text{GLU}}(x) = (W_a x) \odot \sigma(W_b x) \cdot W_c $，$W_a, W_b \in \mathbb{R}^{d \times d_\text{ffn}}, W_c \in \mathbb{R}^{d_\text{ffn} \times d}$。门控的 sigmoid 输出在 $(0,1)$，控制信息流。

## 四、代码实现
```python
class GLU(nn.Module):
    def __init__(self, d, d_ff):
        super().__init__()
        self.Wa = nn.Linear(d, d_ff, bias=False)
        self.Wb = nn.Linear(d, d_ff, bias=False)
        self.Wc = nn.Linear(d_ff, d, bias=False)
    def forward(self, x):
        return self.Wc(self.Wa(x) * torch.sigmoid(self.Wb(x)))
```

## 五、与其他技术对比
- vs ReLU FFN：门控引入非线性调制，表达力强。
- vs SwiGLU：SwiGLU 用 Swish 替代 sigmoid，表现更稳定。

## 六、常见误区
- 门控分支不应用 sigmoid（如直接线性），梯度可能不稳定。
- 把 GLU 与 ReLU 混用导致训练崩溃。

## 七、与开源书/权威来源对应
- meta-llama/llama 使用 SwiGLU。
- d2l-ai/d2l-zh 激活函数章节。
- lucidrains/gated-mlp 库。

## 八、面试题
- GLU 相比 ReLU 优势？答：门控引入输入依赖的调制，训练收敛更快。

## 九、演进与趋势
ReLU → GELU → GLU → SwiGLU/GeGLU（主流 LLM 选择）。

## 十、小结
GLU 门控是现代 LLM FFN 的事实标准，SwiGLU 在 LLaMA/Mistral 中广泛使用。
