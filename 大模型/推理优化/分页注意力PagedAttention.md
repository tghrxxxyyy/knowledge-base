# 分页注意力 PagedAttention

> 对应 Kwon et al., *vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention*, 2023（SOSP 2023）。

## 一、背景与挑战

自回归推理必须为每个请求缓存历史 K 与 V（KV Cache），其显存占用随序列长度线性增长，是服务端显存的主要消费者。传统实现在请求开始时为其**连续预留最大长度**的 KV 空间，造成两类浪费：

- **内部碎片**：请求实际只生成很短文本，预留的长空间大半空闲；
- **外部碎片**：连续分配难以复用零散空隙，且无法让多个请求共享同一系统提示的前缀。

结果是在相同显存下能并发的请求数（batch）被严重压低，吞吐受限。PagedAttention 借鉴操作系统的**虚拟内存分页**思想重构 KV Cache 管理。

## 二、核心原理

PagedAttention 把每个请求的 KV Cache 切成固定大小的**块（block / page）**，每块存若干 token 的 K/V：

1. **非连续存放**：一个请求的 KV 块可散落在显存任意位置，由一张「块表（block table）」记录逻辑顺序到物理块的映射；
2. **按需分配**：随生成推进逐块申请，不再预留最大长度，内部碎片仅限最后一块；
3. **前缀共享**：多个请求若共享同一提示前缀（如系统提示），其对应块可被**引用计数**共享，省下大量显存；
4. **注意力计算**时按块表把分散的物理块 gather 起来参与 softmax，数学结果与连续存放完全一致。

这就像进程虚拟地址到物理页的映射，使得显存成为可精细复用的资源池。

## 三、形式化与数学基础

设块大小为 $B$，请求逻辑长度 $L$，则其占用块数 $n_{\text{blocks}} = \lceil L/B \rceil$。单请求 KV 显存约为：

$$M_{\text{kv}} \approx n_{\text{blocks}} \cdot B \cdot 2 \cdot n_{\text{layers}} \cdot n_{\text{heads}} \cdot d_{\text{head}} \cdot s_{\text{bytes}}.$$

内部碎片期望约 $\frac{B}{2}$ 个 token。设共享前缀长度为 $P$，有 $R$ 个请求复用，则节省：

$$\Delta M = (R-1) \cdot \left\lceil P/B \right\rceil \cdot B \cdot 2 \cdots .$$

注意力评分不变：$\text{softmax}_i\left(\frac{q_i K^\top}{\sqrt{d}}\right)$ 中 $K,V$ 的物理排布不影响数值，仅影响访存顺序。

## 四、代码实现

vLLM 中通过 `block_size` 配置块大小，注意力后端自动按块表计算：

```python
# 概念示意：块表映射（逻辑 block -> 物理 block）
block_table = {
    req_id_A: [7, 12, 3, 19],   # 逻辑顺序对应物理块号
    req_id_B: [7, 12, 8],       # 前缀 [7,12] 与 A 共享
}

def paged_attention(q, block_table, physical_blocks, block_size):
    k_full, v_full = [], []
    for phys in block_table:                 # 按逻辑顺序 gather
        k_full.append(physical_blocks.K[phys])
        v_full.append(physical_blocks.V[phys])
    K = torch.cat(k_full); V = torch.cat(v_full)
    return torch.softmax(q @ K.T / math.sqrt(d), -1) @ V
```

启动示例：

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-7b-chat-hf --block-size 16
```

## 五、与其他技术对比

| 方案 | 碎片 | 前缀共享 | 实现复杂度 |
|------|------|---------|-----------|
| 连续预留 | 高 | 否 | 低 |
| 分页（PagedAttention） | 低 | 是 | 中 |
| RadixAttention（SGLang） | 低 | 树状复用 | 高 |

## 六、常见误区

- **误以为 PagedAttention 改变了注意力数学**：它只重排 K/V 的物理存放与访存，softmax 数值与标准注意力恒等。
- **认为块越大越好**：块过大会增加内部碎片；块过小增加块表与 gather 开销，常用 $B=16$ 左右。
- **共享块被改写会污染他请求**：实现上共享块只被读取，写时触发写时复制（copy-on-write）。

## 七、与开源书·权威来源对应

- Kwon et al., *vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention*, 2023。
- vLLM 仓库：https://github.com/vllm-project/vllm
- 思路类比：操作系统虚拟内存 / 请求分页。

## 八、面试题

- PagedAttention 如何提升显存利用率？内部碎片与外部碎片分别指什么？
- 它是否改变注意力计算结果？为什么？
- 多个请求共享前缀时如何保证安全（引用计数 / 写时复制）？

## 九、演进与趋势

PagedAttention 启发了后续显存复用方案：SGLang 的 **RadixAttention** 把批内请求的公共前缀组织成 radix 树做跨请求复用；**KV Cache 卸载**把冷块移至 CPU/NVMe；以及**分页 + 量化**（块级 FP8 KV）进一步省显存。分页管理已成推理引擎事实标准。

## 十、小结

PagedAttention 用操作系统的分页思想管理 KV Cache，以非连续、按需、可共享的块消除显存碎片并支持前缀复用，在**不改变任何计算结果**的前提下把显存利用率与并发吞吐提升数倍，是现代 LLM 服务引擎的显存管理基石。
