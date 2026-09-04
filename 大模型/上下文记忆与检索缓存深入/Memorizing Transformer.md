# Memorizing Transformer

> 对应 Wu et al., 2022 *Memorizing Transformers*。

## 一、背景与挑战
标准 Transformer 仅看 prompt 内的 token，无法访问训练时未见过的事实。Memorizing Transformer 在注意力中加入 kNN 检索，让模型访问过去文档。

## 二、核心原理
维护一个键值存储 $K, V$（训练或推理时累积），注意力分数 $A = \text{softmax}(Q K^\top / \sqrt d)$ 同时作用于 prompt K/V 和存储 K/V。检索 top-k 文档拼接。

## 三、形式化与数学基础
设 $K_\text{ctx}, V_\text{ctx}$ 是当前上下文，$K_\text{mem}, V_\text{mem}$ 是记忆。$ A = \text{softmax}(Q [K_\text{ctx}; K_\text{mem}]^\top / \sqrt d) $，输出 $ A [V_\text{ctx}; V_\text{mem}] $。

## 四、代码实现
```python
class MemorizingAttention(nn.Module):
    def __init__(self, d, k_mem=1024):
        super().__init__()
        self.q_proj = nn.Linear(d, d)
        self.k_proj = nn.Linear(d, d)
        self.v_proj = nn.Linear(d, d)
        self.k_mem = torch.empty(0, d)
        self.v_mem = torch.empty(0, d)
    def forward(self, x):
        q = self.q_proj(x)
        k = torch.cat([self.k_proj(x), self.k_mem], dim=0)
        v = torch.cat([self.v_proj(x), self.v_mem], dim=0)
        attn = (q @ k.T) / math.sqrt(d)
        return attn.softmax(-1) @ v
```

## 五、与其他技术对比
- vs RAG：Memorizing Transformer 在注意力层内部检索，RAG 在 prompt 构造。
- vs 长上下文：Memorizing 仅检索相关，无关上下文不进入计算。

## 六、常见误区
- 记忆库无界增长，需淘汰策略。
- 检索质量决定效果。

## 七、与开源书/权威来源对应
- lucidrains/memorizing-transformer-pytorch。
- facebookresearch/kNN-LM（相关工作）。

## 八、面试题
- Memorizing Transformer 与 RAG 区别？答：MT 在注意力内检索，RAG 在 prompt 层。

## 九、演进与趋势
kNN-LM → Memorizing Transformer → MemGPT（分层记忆）。

## 十、小结
Memorizing Transformer 把检索融入注意力，是上下文记忆的优雅实现。
