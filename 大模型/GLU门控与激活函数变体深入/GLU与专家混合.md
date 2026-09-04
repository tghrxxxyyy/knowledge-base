# GLU与专家混合

> 对应 Shazeer 2017 *Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer*。

## 一、背景与挑战
GLU 是单输入门控，MoE 是多专家路由。两者结合（MoE+GLU）是现代大模型扩展参数的关键。

## 二、核心原理
MoE 层用路由网络 $g(x) = \text{softmax}(W_g x)$ 选 top-k 专家，每个专家是 GLU FFN。$y = \sum_{i \in \text{top-k}} g_i(x) \cdot E_i(x)$。

## 三、形式化与数学基础
$ g(x) \in \Delta^{N-1} $，选 top-k 索引，$E_i$ 是 SwiGLU FFN。总参数量 $N \cdot d \cdot d_\text{ffn}$，激活量 $k \cdot d \cdot d_\text{ffn}$，稀疏激活 $k/N$ 比例。

## 四、代码实现
```python
class MoE(nn.Module):
    def __init__(self, d, d_ff, n_experts, k):
        super().__init__()
        self.gate = nn.Linear(d, n_experts)
        self.experts = nn.ModuleList([SwiGLU(d, d_ff) for _ in range(n_experts)])
    def forward(self, x):
        scores = self.gate(x)
        topk = scores.topk(self.k, dim=-1)
        out = sum(scores[..., i] * self.experts[i](x) for i in range(self.k))
        return out
```

## 五、与其他技术对比
- vs 稠密 FFN：参数多但激活少，推理 FLOPs 类似。
- vs 哈希路由：哈希路由更快但质量略差。

## 六、常见误区
- 路由坍缩（所有 token 走同一专家）会失效。
- 负载不均衡时部分专家过载。

## 七、与开源书/权威来源对应
- google/switch-transformer。
- mixtral-ai/mixtral-8x7b。

## 八、面试题
- MoE 为何用 GLU？答：GLU 表达力强且参数效率高，适合作为专家模块。

## 九、演进与趋势
稠密 → 稀疏门控 → 专家并行 → 共享专家 + 路由专家。

## 十、小结
GLU 与 MoE 结合是现代 LLM 扩展参数的标准范式。
