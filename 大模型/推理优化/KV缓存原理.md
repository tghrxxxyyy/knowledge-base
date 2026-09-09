# KV 缓存原理

> 对应 llm-course「Inference」(mlabonne) 与 Pope et al., *Efficiently Scaling Transformer Inference*, 2023。

## 一、背景与挑战

自回归生成时，每个新 token 都要对之前所有 token 做注意力。若每步都从头重算历史 key/value，计算量随已生成长度累积到 $O(T^2)$，既慢又重复。KV Cache 的核心动机是：**历史 token 的 K、V 算过一次就缓存复用**，新 token 只算自身的 Q 与新增 K/V，从而把单步复杂度从与总长相关降到近似常数，使解码可流式进行。

## 二、核心原理

Transformer 每层的自注意力对输入 $X$ 投影出 $Q=XW_Q,\ K=XW_K,\ V=XW_V$。生成第 $t$ 个 token 时，已算好的 $1..t-1$ 层 K/V 存入缓存 `cache_K`、`cache_V`。本步只计算 $q_t, k_t, v_t$，拼接后做注意力：

$$\text{Attn}_t = \text{softmax}\!\left(\frac{q_t\,[K_{\text{cache}};k_t]^\top}{\sqrt{d}}\right)[V_{\text{cache}};v_t].$$

之后把 $k_t,v_t$ 追加进缓存，供后续步使用。这样每步工作量只与「新 token + 一次读缓存」相关，而非整段历史重算。

值得区分两个阶段：**Prefill（预填充）**处理整段输入提示，一次性算出全部提示 token 的 K/V 并写入缓存，同时产出第一个输出 token；**Decode（解码）**则逐 token 自回归，每步只读缓存 + 算一个新 token。Prefill 是 compute-bound（一次大矩阵乘），Decode 是 memory-bound（反复读巨型 KV）。两阶段对显存与算力的压力不同，也是后续分离部署与优化分工的依据。此外，同批次内不同请求可各自维护独立缓存，互不干扰，这正是连续批处理能动态进出请求的前提。

## 三、形式化与数学基础

缓存显存为每 token 每层 K、V 各一份。设精度字节数 $s_{\text{bytes}}$（FP16=2，FP8=1），则单请求、序列长 $S$ 的 KV 显存：

$$M_{\text{kv}} = 2 \cdot n_{\text{layers}} \cdot S \cdot n_{\text{heads}} \cdot d_{\text{head}} \cdot s_{\text{bytes}}.$$

对批量 $B$：再乘 $B$。可见显存随 **序列长、批大小、层数、头维** 线性增长，是服务端显存的主要占用项。解码单步注意力访存量为 $O(S)$，呈 **memory-bound**，这正是指引后续量化、MQA/GQA、分页显存优化的出发点。

## 四、代码实现

概念示意（不含实现细节，强调缓存拼接）：

```python
cache_K, cache_V = [], []          # 每层一个列表，简化表示
for t in range(max_len):
    q_t, k_t, v_t = proj(x_t)      # 仅算当前 token
    cache_K.append(k_t); cache_V.append(v_t)
    K = torch.cat(cache_K, dim=0)  # 拼接历史
    V = torch.cat(cache_V, dim=0)
    out_t = softmax(q_t @ K.T / d**0.5) @ V
    x_t = sample(out_t)            # 采样下一 token
```

HuggingFace 中以 `past_key_values` / `use_cache=True` 实现：首步返回缓存，后续步传入以增量计算。

## 五、与其他技术对比

| 维度 | 无 KV Cache | 有 KV Cache | 进一步：GQA/MQA |
|------|-----------|-----------|----------------|
| 单步算力 | $O(T^2)$ | $O(T)$ | 同左，KV 更小 |
| 显存 | 低（不存） | 高（随 $T$ 增长） | 中（KV 压缩） |
| 用途 | 仅训练 | 推理标配 | 高并发推理 |

## 六、常见误区

- **误以为 KV Cache 主要省算力**：它确实省算力，但工程瓶颈与代价主要在**显存**（随长度线性膨胀）。
- **长对话不淘汰**：超长上下文会撑爆显存，需滑动窗口、截断或前缀缓存策略。
- **训练也用 KV Cache**：训练需全序列双向注意力，通常不缓存，而是一次算全序列。

## 七、与开源书·权威来源对应

- Pope et al., *Efficiently Scaling Transformer Inference*, 2023（系统分析 KV Cache 的显存/算力权衡）。
- llm-course「LLM Engineer / Inference」(mlabonne)：https://github.com/mlabonne/llm-course
- Vaswani et al., *Attention Is All You Need*, 2017（注意力投影来源）。

## 八、面试题

- KV Cache 主要省的是算力还是显存？为什么？
- 长对话推理为何显存随长度线性增长？给出显存公式。
- GQA/MQA 如何从 KV Cache 维度减小开销？

## 九、演进与趋势

KV Cache 管理是现代推理优化的中心：分页（PagedAttention）消碎片、前缀缓存复用公共提示、MQA/GQA 压缩 KV 体积、FP8/INT4 KV 量化省带宽、以及 KV 卸载到 CPU/NVMe。长上下文（128K+）场景更依赖这些组合手段。

## 十、小结

KV Cache 通过缓存历史 key/value 把解码单步计算从 $O(T^2)$ 降为 $O(T)$，是流式自回归生成的基础；其主要代价是随序列长度线性增长的显存，这直接催生了分页、量化、GQA/MQA 等一整套推理优化技术。
