# In-Flight Batching

> 对应 Yu et al., *Orca: A Distributed Serving System*, 2022 与 NVIDIA TensorRT-LLM 文档（即连续批处理）。

## 一、背景与挑战

大模型在线服务若采用**静态批处理**，需等批次内最长序列生成完毕才统一释放，导致短请求被长请求拖住、GPU 在等待中大量空转，吞吐与短请求延迟都恶化。In-Flight Batching（亦称 **iteration-level / continuous batching**）是 TensorRT-LLM 与 vLLM 等引擎采用的动态调度技术，用于消除这一「短板效应」。它与本系列「推理优化/连续批处理」同指一物，本篇侧重 TRT-LLM 的实现与工程要点。

## 二、核心原理

In-Flight Batching 把调度粒度从「整条序列」降到「**每一个生成步**」：

1. 每个解码步，调度器扫描运行中的请求；
2. 已完成的请求立即移出，回收其 KV Cache 块；
3. 新到达请求在该步即可填入空闲槽位，参与本次前向；
4. 所有未完成请求拼成动态批次做一次并行前向。

由于不同请求处于各自序列的不同进度，批次构成每步变化，GPU 几乎始终被填满。TRT-LLM 与 **分页 KV Cache** 协同：移出请求的块即时释放供复用，从而同时获得高利用率与高并发。

## 三、形式化与数学基础

设窗口内 $N$ 条请求长度 $L_i$，单步耗时 $t_{\text{step}}$。静态批处理完工：

$$T_{\text{static}} = \max_i L_i \cdot t_{\text{step}}.$$

连续/In-Flight 批处理在并行度 $P$ 下理想完工：

$$T_{\text{in-flight}} \approx \frac{\sum_i L_i}{P} \cdot t_{\text{step}},$$

吞吐提升比约 $\frac{\max_i L_i}{\bar L}$。设单步并发上限 $B$，约束 $|\{\text{未完成}\}|\le B$。当长度方差大时收益最显著。

## 四、代码实现

TRT-LLM 通过 `trtllm-serve` 或 Triton 启用动态批（示意启动）：

```bash
trtllm-serve --engine_dir ./engine \
  --max_num_sequences 256 \     # 单步最大并发（参数名以官方为准）
  --port 8000
```

概念伪代码（每步调度）：

```python
while pending or running:
    done = [r for r in running if r.finished]
    for r in done:
        free_kv_blocks(r); running.remove(r); emit(r.result)
    admit = pending[:max_seq - len(running)]
    running += admit; pending = pending[len(admit):]
    logits = engine.step(collate(running))   # 动态拼批前向
    for r in running:
        r.append(sample(logits[r.slot]))
```

## 五、与其他技术对比

| 维度 | 静态批处理 | In-Flight Batching | + 分页 KV |
|------|-----------|-------------------|-----------|
| 调度粒度 | 序列级 | token 步级 | token 步级 |
| 显存碎片 | 高 | 高 | 低 |
| 短请求延迟 | 被拖 | 不被拖 | 不被拖 |
| 引擎示例 | 早期 HF | TRT-LLM / vLLM | vLLM |

## 六、常见误区

- **以为 In-Flight Batching 改变输出**：只改调度时机，不改计算，输出分布与逐条串行一致。
- **并发上限越大越好**：受 KV Cache 容量约束，过大触发抢占/OOM。
- **与连续批处理是两种技术**：二者同义，仅命名来源不同（Orca/vLLM 称 continuous，TRT-LLM 称 in-flight）。
- **认为无上限并发**：单步并发受 KV Cache 总量约束，超过将触发抢占或 OOM，须按显存预算设定。
- **忽视与分页的耦合**：没有分页 KV，动态进出请求仍受连续显存碎片拖累，收益打折扣。

## 七、与开源书·权威来源对应

- Yu et al., *Orca: A Distributed Serving System for Transformer-Based Generative Models*, 2022。
- NVIDIA TensorRT-LLM 文档（In-Flight Batching / Continuous Batching）。
- 见本系列「推理优化/连续批处理」「分页注意力 PagedAttention」。

## 八、面试题

- In-Flight Batching 如何提升 GPU 利用率？为何必须与分页 KV 配合？
- 它相比静态批处理的吞吐提升来自何处？
- 并发上限受什么约束？

## 九、演进与趋势

与 **前缀缓存**（共享提示页）、**投机解码**（草稿步也走动态批）、**抢占式调度**（按优先级换出长请求）结合；多卡下与张量/流水并行协同。SGLang 的 RadixAttention 进一步在批内做前缀树复用，是同一方向的延伸。

## 十、小结

In-Flight Batching 即连续批处理在 TRT-LLM 中的实现：以 token 步为粒度动态进出请求，消除静态批处理的木桶效应，配合分页 KV Cache 提升显存利用率与吞吐；对输出分布无影响，是生产推理引擎的标配调度机制。
