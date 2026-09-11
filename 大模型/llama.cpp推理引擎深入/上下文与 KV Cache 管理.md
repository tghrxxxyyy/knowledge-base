# 上下文与 KV Cache 管理

> 对应 ggerganov/llama.cpp 的上下文与 KV 管理；Ainslie 2023 GQA；Kwon 2023 vLLM（PagedAttention）。

## 一、背景与挑战

自回归解码时，每生成一个新 token 都要用到此前所有 token 的 Key/Value。若每步都重算，代价随序列长度呈二次增长；于是把历史 K/V 缓存下来（KV cache），用空间换时间。但 KV cache 随上下文线性增长，长对话下它往往超过模型权重本身，成为端侧内存的头号约束。

llama.cpp 的特点是「不依赖复杂分页」：用 slot 管理多个会话，用前缀缓存复用公共前缀，用滑动窗口限制注意力跨度，以较低的实现复杂度控制内存。

## 二、核心原理

四个关键机制：

1. **逐 token 追加**：解码时只对当前 token 算 Q、K、V，把 K/V 追加进 cache，注意力只读历史而不重算。
2. **前缀缓存（prompt cache）**：相同前缀（如固定的 system prompt）跨请求共享，命中则跳过重算。
3. **滑动窗口注意力**：把可见历史限制在最近 $w$ 个 token，把内存上界从 $O(S)$ 降为 $O(w)$。
4. **多序列共享与槽位**：多个 slot 各自持有 KV 区，可复用前缀但保持采样状态独立。

GQA/MQA 通过减少 KV 头数，从模型结构层面直接缩小 cache。

## 三、形式化与数学基础

KV cache 字节数：

$$ |KV| = 2 \cdot L \cdot n_{layers} \cdot n_{kv\_heads} \cdot d_{head} \cdot \text{prec} \cdot S $$

其中 $L$ 为序列长度、系数 2 表示 K 与 V、`prec` 为每元素字节数。GQA 把 $n_{kv\_heads}$ 从 $n_{heads}$ 降到 $n_{kv}$，压缩比为：

$$ r = \frac{n_{heads}}{n_{kv\_heads}} $$

滑动窗口把 $L$ 替换为 $w$，于是 $|KV|_{window} = 2 L_{layers} n_{kv} d_{head} \text{prec} \cdot w$。注意 Transformer 注意力本身仍是 $O(S^2 d)$ 的计算量，窗口化把它降为 $O(S w d)$。

前缀缓存命中时，只需为新增 token 计算 KV，省下的计算量正比于命中前缀长度占全序列的比例。

## 四、代码实现

```cpp
// 上下文与 KV 参数设置（示意，具体字段以头文件为准）
llama_context_params params = llama_context_default_params();
params.n_ctx      = 4096;     // 总上下文长度
params.n_batch    = 512;      // 逻辑批大小
params.n_seq_max  = 4;        // 并发序列数（与槽位对应）
params.flash_attn = true;     // 启用 FlashAttention 降低中间显存

llama_context * ctx = llama_new_context_with_model(model, params);

// 滑动窗口在支持的模型上通过 rope/attention 参数启用
// 多序列共享前缀：同一 prompt 的 KV 可被复用
// llama_kv_cache_seq_cp(ctx, src_seq, dst_seq, p0, p1)  // 复制前缀 KV

// 清理某序列占用的 KV
// llama_kv_cache_seq_rm(ctx, seq_id, -1, -1);
```

RoPE 缩放（`rope_freq_base`、`rope_scaling`）可在不重训的情况下扩展有效上下文，但会牺牲远距离精度。

## 五、与其他技术对比

| 方案 | 内存上界 | 实现复杂度 | 复用能力 | 典型场景 |
| --- | --- | --- | --- | --- |
| 无缓存（重算） | $O(1)$ 但算力爆炸 | 低 | 无 | 教学 |
| 全量 KV cache | $O(S)$ | 低 | 前缀可复用 | 通用 |
| 滑动窗口 | $O(w)$ | 低 | 有限 | 长对话端侧 |
| 分页 KV（vLLM） | $O(\text{实际占用})$ | 高 | 强，碎片少 | 高并发服务 |
| GQA/MQA | $O(S/r)$ | 模型侧改 | 同全量 | 现代模型默认 |

## 六、常见误区

- 认为上下文越长越好：端侧内存有限，需设窗口与上限，否则 OOM 或剧烈降速。
- 忽略 KV cache 才是长上下文瓶颈：量化权重只压缩权重，KV 仍是线性增长。
- 认为前缀缓存无条件生效：前缀必须逐 token 完全一致，任何系统提示改动都会导致失效。
- 混淆滑动窗口与全局注意力：窗口化会牺牲远距离依赖，任务敏感时需谨慎。
- 忽视 RoPE 扩展的精度代价：外推越长，远距离注意力质量下降越明显。
- 认为权重量化会自动压缩 KV：默认量化只作用于权重，KV 需单独的量化配置。
- 忽略多序列共享 KV 的一致性：共享前缀的同时，采样状态与位置编码必须各自独立。

## 七、与开源书·权威来源对应

ggerganov/llama.cpp 的上下文参数与 KV cache API 是权威来源；Ainslie 2023 GQA 提出分组查询注意力以压缩 KV；Kwon 2023 vLLM 的 PagedAttention 提供了分页管理 KV 的生产级方案。具体 API 与参数以仓库最新文档为准。

## 八、面试题

- 问：llama.cpp 如何省 KV 内存？答：滑动窗口、前缀缓存共享、GQA 减少 KV 头数。
- 问：GQA 的压缩比如何定义？答：查询头数与 KV 头数之比 $r$，KV 内存降为 $1/r$。
- 问：前缀缓存命中需要什么条件？答：前缀 token 序列逐一致。
- 问：上下文长度增加对延迟有何影响？答：注意力计算随 $S$ 增长，解码每步耗时上升。

## 九、演进与趋势

更精细的 KV 管理与 CPU 卸载支持更长上下文；与 FlashAttention、分页方案融合；量化 KV（如 8 位/4 位 cache）进一步压缩内存。具体能力以仓库最新文档为准。

## 十、小结

KV cache 用空间换时间，但它的线性增长是长上下文的根本约束。llama.cpp 以 slot、前缀缓存、滑动窗口与 GQA 这套轻量组合控制内存，使端侧也能处理较长对话。
