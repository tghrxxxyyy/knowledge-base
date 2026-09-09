# 上下文窗口与 KV Cache 扩展

> 对应 vLLM *PagedAttention*（Kwon et al., 2023）；Dao et al., *FlashAttention*（2022）；参考 HuggingFace KV 缓存文档、llm-course 推理优化章节。

## 一、背景与挑战

自回归生成时，每生成一个新 token 都需注意力计算所有历史 token 的 Key/Value。这些 KV 必须缓存，且**显存随上下文长度线性增长**。当窗口扩展到 128K/1M，KV Cache 成为推理服务的主要显存瓶颈——往往远超模型权重本身。挑战：如何在有限显存下服务超长上下文、避免碎片化、并降低长序列下的访存开销。

## 二、核心原理

KV Cache 为每个层、每个位置缓存 $K,V\in\mathbb{R}^{n\times d}$。优化手段：(1) **PagedAttention**——把 KV 按「页（block）」分页管理，像操作系统虚拟内存一样按需分配、跨请求共享前缀，消除预留浪费与碎片；(2) **KV 量化**——把 KV 从 FP16 压到 INT8/INT4，显存近乎减半/减四；(3) **稀疏/分块注意力**——长序列只算重要位置，降计算；(4) **滑动窗口**——只保留最近 $w$ 个 KV，旧的直接丢弃（适用于对话/流式）。推理侧瓶颈常在「显存带宽与容量」而非算力。

## 三、形式化与数学基础

单层单请求 KV 显存（精度 $b$ 字节、层数 $L$、头数 $H$、维 $d$、长度 $n$）：

$$\text{Mem}_{KV} = 2 \cdot L \cdot n \cdot (H d) \cdot b = 2\,L\,n\,d_{model}\,b$$

（因子 2 为 K 与 V）。以 7B 模型、$b=2$、128K 长度计：$\approx 2\times 32\times 128000\times 4096\times 2 \approx 67$ GB——已超过多数单卡。KV 量化到 INT4（$b=0.5$）降为约 17 GB。PagedAttention 把连续逻辑块映射到不连续物理页，碎片率从近 $100\%$ 预留降到接近 0。

## 四、代码实现

```python
from vllm import LLM, SamplingParams

llm = LLM(
    model="meta-llama/Llama-3-8B",
    max_model_len=128000,           # 长上下文窗口
    gpu_memory_utilization=0.9,
    kv_cache_dtype="fp8",            # KV 量化降本
    enforce_eager=False,            # 启用 PagedAttention + 内核融合
)
params = SamplingParams(max_tokens=512)
# 分页 KV 自动管理，多请求共享前缀省显存
out = llm.generate(["超长文档...\n请总结"], params)
```

HuggingFace 生成可用 `past_key_values` 缓存；配合 `use_cache=True` 复用历史 KV，避免重算。

## 五、与其他降本手段对比

| 手段 | 降什么 | 代价 | 适用 |
|---|---|---|---|
| PagedAttention | 碎片/浪费 | 几乎无 | 服务 |
| KV 量化 | 显存 | 极小精度损 | 长上下文 |
| 滑动窗口 | KV 长度 | 丢旧信息 | 对话 |
| 稀疏注意力 | 计算 | 可能丢全局 | 长序列 |

## 六、常见误区

- 以为瓶颈在算力：长上下文服务常卡在 KV 显存与带宽。
- 静态预留 KV：碎片严重，用 PagedAttention 才高效。
- 不分页直接放大窗口：显存爆满，吞吐骤降。
- 量化无校验：过低比特（INT2）显著掉点，需先测。

## 七、与开源书·权威来源对应

- Kwon et al., *vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention*, 2023。
- Dao et al., *FlashAttention*, 2022（KV 重算/IO 优化基础）。
- HuggingFace `transformers` KV cache 与 `past_key_values` 文档。

## 八、面试题

1. 为何长上下文服务显存瓶颈在 KV 而非权重？答：KV 随长度线性增长，128K 时可达数十 GB，远超固定权重。
2. PagedAttention 解决什么？答：KV 分页、按需分配、跨请求共享，消除碎片与预留浪费。
3. KV 量化常用何精度？答：INT8/FP8 常用，INT4 更激进需校验。

## 九、演进与趋势

KV 管理持续进化：从 PagedAttention 到 **Prefix Caching**（多轮共享系统前缀）、**KV 卸载（offload 到 CPU/NVMe）** 应对超长、以及 **MQA/GQA**（减少 KV 头数）从模型结构上直接降 KV。量化也从均匀走向 per-head/group 精细。

## 十、小结

长上下文推理的显存瓶颈在 KV Cache 而非权重。PagedAttention 消除碎片、KV 量化压缩体积、滑动窗口与稀疏化降计算，配合 GQA 等结构优化，共同把超长窗口服务变成可落地的工程现实。
