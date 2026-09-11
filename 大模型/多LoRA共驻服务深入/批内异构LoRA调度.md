# 批内异构LoRA调度

> 对应 Hu et al. 2021「LoRA」、Kwon et al. 2023「vLLM/PagedAttention」与 huggingface/peft。

## 一、背景与挑战

多 LoRA 服务中，同一批次（batch）往往混合了不同适配器的请求：用户 A 用客服适配器、用户 B 用代码适配器。若按请求逐一切换权重串行计算，GPU 利用率被切换开销吞噬；若按适配器把批次拆成多个子批，又损失了批处理的吞吐优势。

核心挑战是：**在不切换基础权重的前提下，让同一批内不同的低秩增量并行、正确地参与计算**。

## 二、核心原理

两种主流做法：

1. **分桶 + 分组 GEMM**：按 adapter_id 把批内序列分桶，逐桶计算增量 $s_a (X_{S_a} A_a^\top) B_a^\top$，再散射回原位置。vLLM 的多 LoRA 支持即采用这种「分组矩阵乘」统一处理批内异构。
2. **合并权重（shrink/expand）**：当批内适配器数很少时，可把若干适配器的 $BA$ 合并进基础权重副本，但适配器一多就不划算。

此外还有 Punica 式的 SGMV（Segmented Gather Matrix-Vector）内核，把不同适配器的 A/B 在 token 维度 gather 后一次内核完成，减少内核启动与分支开销。

3. 内核融合：把 gather、矩阵乘与 scatter 合并到一个算子，减少显存往返。

## 三、形式化与数学基础

设批内序列集合按适配器分桶为 $\{S_a\}$，第 $a$ 个适配器的缩放因子为 $s_a$，低秩矩阵为 $A_a \in \mathbb{R}^{r \times k}$、$B_a \in \mathbb{R}^{d \times r}$。该层输出为：

$$H = X W^\top + \sum_{a} s_a \, (X_{S_a} A_a^\top) B_a^\top$$

其中 $X \in \mathbb{R}^{n \times k}$ 是本层输入，$X_{S_a}$ 表示只取桶 $a$ 的行。若批内共 $G$ 个适配器，则增量的额外计算量约为：

$$FLOPs_{lora} \approx \sum_{a=1}^{G} |S_a| \cdot (k r + r d) \cdot 2$$

相比逐请求切换（每个请求一次内核启动 + 同步），分组 GEMM 把 $G$ 次小 GEMM 合并为少量大内核，显著降低调度与启动开销。

## 四、代码实现

分组计算批内异构 LoRA 增量的参考实现。

```python
import torch

def batched_lora(X, W, adapters, groups):
    # X: [n, k]，W: [d, k]，groups: {adapter_id: LongTensor(行索引)}
    out = X @ W.T                                  # 基础权重，一次大 GEMM
    for aid, idx in groups.items():
        A, B, s = adapters[aid]                    # A: [r, k], B: [d, r]
        x_sub = X.index_select(0, idx)             # 按桶取行
        delta = s * ((x_sub @ A.T) @ B.T)          # [len(idx), d]
        out.index_add_(0, idx, delta)              # 散射回原位置
    return out
```

要点：`index_select` + `index_add_` 形成 gather/scatter；真实高性能实现会把它们融进单个自定义内核（如 SGMV），避免多次读写显存。

## 五、与其他技术对比

| 调度方式 | 批内异构支持 | 切换开销 | 吞吐 | 实现复杂度 |
| --- | --- | --- | --- | --- |
| 逐请求切换权重 | 弱 | 高 | 低 | 低 |
| 按适配器拆子批 | 中 | 中 | 中 | 低 |
| 分组 GEMM | 强 | 低 | 高 | 中 |
| 融合内核（SGMV） | 强 | 最低 | 最高 | 高 |
| 按 token 动态路由 | 最强 | 高（需掩码） | 中 | 很高 |

## 六、常见误区

- 误区一：异构批一定比同构慢很多。合理分组后，增量计算占比小，开销可控。
- 误区二：分组 GEMM 一定最优。适配器数量多、每桶很小时，内核启动与 gather/scatter 成本会上升，需与融合内核权衡。
- 误区三：可以随意改变批内序列顺序。调度器需维护序列与原请求的映射，否则响应会串台。
- 误区四：桶不均衡无所谓。若某适配器占了绝大多数序列，分组收益下降，需考虑负载均衡或合并策略。

## 七、与开源书·权威来源对应

- Hu, E. et al. (2021)《LoRA: Low-Rank Adaptation of Large Language Models》。
- Kwon, W. et al. (2023) vLLM / PagedAttention，描述多适配器批处理支持。
- Chen, L. et al. (2023) Punica，提出 SGMV 批内多 LoRA 内核。
- huggingface/peft、vllm-project/vllm 的 LoRA 相关实现。
- Sheng, Y. et al. (2023) S-LoRA，讨论大规模多 LoRA 服务的高效批处理。
- 各推理框架中多适配器调度的官方文档（以最新版本为准）。

## 八、面试题

1. 批内异构 LoRA 如何高效实现？答：按适配器分桶、分组矩阵乘，或融合的 gather-MMA 内核。
2. 为什么分组能降低开销？答：把多次小内核合并为少量大内核，减少内核启动与同步。
3. 增量计算占基础权重计算的比例？答：与秩 $r$ 和隐藏维 $d,k$ 有关，通常远小于 1（$r \ll d,k$）。
4. 分组 GEMM 的代价是什么？答：gather/scatter 的额外显存读写与桶不均衡。
5. 为什么说增量的计算量通常很小？答：秩 $r \ll d, k$，增量 FLOPs 相对基础权重 GEMM 可忽略。
6. 桶内序列长度差异大会有什么影响？答：内核并行度与负载均衡变差，可能拉长尾延迟。

## 九、演进与趋势

更细粒度（甚至 token 级）的 LoRA 路由正在被探索，例如按 token 动态选择适配器以支持混合专家式行为。内核层面趋向把 gather、GEMM、scatter 融合为单一算子。

工程上还需关注批内适配器数量上限、调度公平性与超时保护，具体支持范围以各推理框架官方文档为准。

## 十、小结

批内异构调度是多 LoRA 服务高吞吐的关键工程点。核心思想是「分桶 + 分组计算」避免重复切换，并在需要时用融合内核进一步压低开销。理解 $H = XW^\top + \sum_a s_a (X_{S_a}A_a^\top)B_a^\top$ 这一形式，是设计调度策略的基础。

落地时优先保证正确性（序列与适配器的映射不串台），再逐步优化内核与调度策略。
