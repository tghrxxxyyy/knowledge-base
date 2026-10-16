# FlashAttention 原理

> 对应 Dao et al., *FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*, NeurIPS 2022；Dao, *FlashAttention-2: Faster Attention with Parallelism and Partitioning*, 2023；Tri Dao 的 FlashAttention / flash-attn 官方实现；与「推理优化/PagedAttention」「高效注意力深入/分块与重计算」互为姊妹篇。深入数学见文中在线 softmax 推导。

## 一、背景与挑战

标准自注意力计算分两步：先算 $S = QK^\top / \sqrt{d}$（$n \times n$），再 $\text{softmax}(S)V$。问题不在 FLOPs，而在 **IO**：$S$ 必须写回 HBM（高带宽显存），softmax 再读回来，随后 $P$ 又写回、再读出来乘 $V$。当序列长度 $n$ 增大，$S$ 的元素数按 $n^2$ 增长，HBM 读写量成为瓶颈。

设 SRAM 大小为 $M$（A100 约 192KB，远小于 HBM 的 40GB），朴素实现的 IO 复杂度约 $\mathcal{O}(n^2 d + n^2)$，而计算量 $\mathcal{O}(n^2 d)$。在长序列下**带宽墙**先于算力墙到来：GPU 算力闲置，等显存搬运。

此外，训练时为反向传播必须把 $S$ 或 $\text{softmax}(S)$ 存下来，显存占用 $\mathcal{O}(n^2)$，16k 序列、batch=1 就可能爆显存。FlashAttention 要同时解决：**更快（更少 HBM 访问）且更省显存（不物化 $n \times n$），并且数学上精确等价（不是近似）**。

## 二、核心原理

核心思想：**分块（tiling）+ 在线 softmax**。把 $Q, K, V$ 按行切成块，外层循环扫 $K/V$ 块，内层用 SRAM 里的小块算局部注意力，用**在线归一化**维护运行中的 max 与 denominator，从不把完整 $S$ 写进 HBM。

流程（前向）：

1. 初始化每个查询行的运行统计 $m_i = -\infty$（最大值）、$l_i = 0$（指数和）、$o_i = 0$（输出累加）。
2. 对每个 $K$ 块、$V$ 块：载入 SRAM → 算局部 $S_{ij} = Q_i K_j^\top$ → 更新行 max $m'$ → 用旧/新 max 重标定 $l$ 与 $o$ → 累加。
3. 扫完所有列块后，$o_i$ 除以 $l_i$ 得到精确的 softmax 注意力输出。
4. 反向同样分块重算（recompute）$S$ 与 $P$，只存 $O$、$L=\log l$ 与输入，显存从 $\mathcal{O}(n^2)$ 降到 $\mathcal{O}(n)$。

关键不变式：**任何时刻的 $l$ 与 $o$ 都等价于「只用已见列块」的完整 softmax 分子分母**，因此最终结果与先物化 $S$ 再 softmax 在浮点误差范围内数学等价（exact，不是 approximation）。

FlashAttention-2 的改进：减少非矩阵乘工作（rescale 挪到内循环外）、在 batch 与 head 维并行、序列维切分更均衡，使实际吞吐逼近理论 FLOPs 上限的 50%～70%（FA1 约 25%～40%）。

## 三、形式化与数学基础（在线 softmax）

对查询行 $i$，设已处理列块集合递增，维护

$$ m^{(t)} = \max_{j \le t} \text{rowmax}(S_{ij}), \quad l^{(t)} = \sum_{j \le t} \exp\!\big(S_{ij} - m^{(t)}\big) $$

新块 $S_{i,t+1}$ 到达时：

$$ m_{\text{new}} = \max\big(m^{(t)},\ \text{rowmax}(S_{i,t+1})\big) $$

$$ l_{\text{new}} = e^{\,m^{(t)} - m_{\text{new}}}\, l^{(t)} + \sum_{j \in \text{new}} \exp\big(S_{ij} - m_{\text{new}}\big) $$

$$ o_{\text{new}} = e^{\,m^{(t)} - m_{\text{new}}}\, o^{(t)} + \text{softmax\_unnorm}(S_{i,t+1})\, V_{t+1} $$

最终输出 $O_i = o^{(\text{final})} / l^{(\text{final})}$。指数前的缩放因子 $e^{m_{\text{old}}-m_{\text{new}}}$ 正是「旧结果对新 max 的重标定」，保证数值稳定（全程减 max，无溢出）。

IO 复杂度：块大小 $B_c$（列）、$B_r$（行）时，HBM 访问约

$$ \text{IO} = \mathcal{O}\!\left(\frac{n^2 d^2}{M}\right) \quad (\text{与 } n \text{ 线性到平方之间取决于分块策略，显著低于朴素 } \mathcal{O}(n^2)) $$

论文给出的实用界：当 $M$ 足够放下 $Q$ 一个行块与 $K/V$ 一个列块时，IO 为 $\mathcal{O}(n^2 d^2 M^{-1})$，在 A100 上相对朴素 PyTorch 可到 **2～4 倍**端到端加速，且反向显存线性于 $n$。

## 四、代码实现

```python
# 训练/研究侧：flash-attn 包（需 Ampere+，fp16/bf16）
# q,k,v: (batch, seqlen, nhead, headdim) 或 (batch, nhead, seqlen, headdim)
from flash_attn import flash_attn_func

out = flash_attn_func(
    q, k, v,
    dropout_p=0.0,
    causal=True,            # 因果 mask 在分块内处理，不物化 n×n mask
    softmax_scale=None,     # 默认 1/sqrt(d)
)

# 等价的朴素参考（仅用于正确性对照，勿在长序列训练中使用）
def naive_attn(q, k, v):
    s = (q @ k.transpose(-2, -1)) / (q.shape[-1] ** 0.5)
    return torch.softmax(s, dim=-1) @ v
```

工程接入要点：

- **dtype**：必须 fp16/bf16；fp32 会退化或不支持。
- **head_dim**：经典实现多要求 64/96/128/160/192/256，奇数维不支持。
- **变体选择**：训练多用 FA2；推理长上下文可看 FA3（Hopper 上用 TMA/WGMMA）或与 PagedAttention 结合（vLLM 侧 paged flash）。
- **与 checkpointing 组合**：FA 已不存 $n^2$，再套全量 activation checkpointing 通常收益有限，优先省时间。

## 五、与其他技术对比

| 维度 | 朴素 Attention | FlashAttention | PagedAttention | 线性/稀疏注意力 |
| --- | --- | --- | --- | --- |
| 是否精确 | 是 | **是（等价）** | 是 | 否（近似/结构假设） |
| $n\times n$ 物化 | 要 | 不要 | 不要 | 不要 |
| 显存 | $\mathcal{O}(n^2)$ | $\mathcal{O}(n)$ | $\mathcal{O}(n)$ 分页 | $\mathcal{O}(n)$ |
| 主要收益 | — | IO-aware 加速 | KV 分页换入换出 | 超长上下文复杂度 |
| 适用 | 短序列调试 | 训练+推理主力 | 服务端 KV 管理 | 128k+ 或流式 |

与 **Memory-Efficient Attention**（xformers）同属分块精确注意力，Flash 在 IO 调度与反向重算上更激进，生态更主流。与 **PagedAttention** 正交：前者解决「算注意力时的 HBM 访问」，后者解决「KV Cache 的显存碎片」，vLLM 中两者同时使用。

## 六、常见误区

1. **Flash 是近似算法**——错，前向数学等价，仅浮点舍入顺序不同。
2. **只对训练有用**——错，推理同样受益；长对话/文档场景批处理时尤其明显。
3. **用了 Flash 就不需要注意 mask 工程**——causal、滑窗、自定义 mask 仍要正确传入，错误 mask 会被「高效地算错」。
4. **显存 $\mathcal{O}(n)$ 就可以无限长序列**——计算仍是 $\mathcal{O}(n^2)$，长上下文最终撞算力与 KV Cache 墙，需配合稀疏/线性注意力或分层。
5. **换 FA 版本零风险**——FA2/FA3 与旧 kernel 的 dropout、causal 细节、head_dim 支持不同，升级要过回归。

## 七、与开源书·权威来源对应

- Dao et al., *FlashAttention*, NeurIPS 2022（在线 softmax 与 IO 复杂度原始论文）。
- Dao, *FlashAttention-2*, 2023（并行与划分优化）。
- Tri Dao / Hazy Research flash-attention 仓库与 GTC/博客分享。
- Rabe & Staats, *Self-attention Does Not Need O(n²) Memory*（同路线的内存高效实现）。
- d2l-zh 第 11 章注意力建模、《Efficient Transformers》综述中的 IO 视角。

## 八、面试题

**1. FlashAttention 为何不改变数学结果却能提速？**  
要点：速度来自减少 HBM 读写（IO-aware 分块），不是减少 FLOPs 算法语义；在线 softmax 用运行 max/sum 保持与全局 softmax 等价，把 $n^2$ 中间矩阵留在 SRAM。

**2. 在线 softmax 的关键是什么？**  
要点：维护每行运行最大值 $m$ 与加权和 $l$，新块到达时用 $e^{m_{\text{old}}-m_{\text{new}}}$ 重标定旧累积量，最终 $o/l$ 即精确结果，且数值稳定。

**3. 反向传播时为什么不存 $S$？**  
要点：反向需要 $P$ 与 $dV, dK, dQ$，Flash 反向**重算**局部 $P$（recompute），只持久化输出 $O$ 与 $\log l$，显存线性于 $n$。

**4. FlashAttention 与 PagedAttention 解决同一问题吗？**  
要点：不同。FA 优化注意力核的显存访问模式；Paged 优化 KV Cache 的分页与碎片。服务端两者常叠加。

**5. 什么情况下 Flash 收益不明显？**  
要点：序列很短、batch 已打满算力、或 kernel 启动/数据搬运占比高时；此时瓶颈不在 $n^2$ 物化。

## 九、演进与趋势

- **FlashAttention-2/3**：更多并行维、Hopper TMA/WGMMA，逼近硬件峰值；FA3 是 H100 长上下文训练默认选项之一。
- **与 GQA/MQA/MLA 结合**：KV 头数减少后，FA 的 K/V 载入更省，成为 Llama/Mistral 系标配路径。
- **长上下文系统**：FA + 滑窗/环形注意力（Ring Attention）+ 序列并行，支撑 128k～1M 上下文训练。
- **推理栈集成**：vLLM、TensorRT-LLM、SGLang 均以内核形式吸收 FA 变体，与连续批处理、投机解码协同。
- **近似注意力回潮**：在百万 token 场景，NSA、线性注意力等与 FA 互补，形成「短中长混合」架构。

## 十、小结

FlashAttention 把注意力从「先物化再计算」改成「分块计算、在线归一化、永不写回 $n\times n$」，用 IO 视角同时拿到**加速与省显存**，且结果精确等价。它是当代 Transformer 训练/推理的基础设施级算法：理解在线 softmax 与 HBM/SRAM 层次，比背 API 更重要；选型时把它与 Paged、序列并行、GQA 一起放进系统里看，才能解释「为什么现在的长上下文能跑」。
