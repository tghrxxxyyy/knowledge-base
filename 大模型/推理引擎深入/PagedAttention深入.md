# PagedAttention 深入

> 对应 llm-course（mlabonne）推理优化章节；vLLM PagedAttention（Kwon et al., 2023, SOSP）；与操作系统虚拟内存分页思想类比（以官方最新文档为准）。

## 一、背景与挑战

自回归生成时，每个序列需在显存中保存 Key/Value 缓存（KV cache）。传统实现「为每个序列预留一段连续、且按最大长度申请」的显存：

- 碎片：序列实际长度不一，预留空间大量闲置。
- 内部碎片：预留 max_len 但实际只用到一部分。
- 外部碎片：连续申请导致无法利用零散空块。
- 无法共享：多请求共享前缀时 KV 重复存储。

这直接限制了并发序列数，成为吞吐瓶颈。

## 二、核心原理

PagedAttention 借操作系统的「虚拟内存分页」思想：

1. 分块（page/block）：把 KV 缓存切成固定大小的块（如每块 16 个 token）。
2. 按需分配：序列增长时才分配新块，不预占 max_len。
3. 页表映射：用块表（block table）记录逻辑位置→物理显存块的映射，类似页表。
4. 前缀共享：多个序列共享同一前缀块（引用计数），零冗余。

注意力计算时按块表把分散的物理块拼成逻辑连续的 KV，注意力内核感知分页结构。

## 三、形式化与数学基础

设序列逻辑块序列 $B=\{b_1,\dots,b_m\}$，块表 $\Pi$ 将其映射到物理块 $\Pi(b_i)$。注意力第 $i$ 个查询对第 $j$ 个键的分数：

$$ a_{ij} = \frac{q_i^\top k_{\Pi(b_{\lceil j/K\rceil})[j\bmod K]}}{\sqrt{d}} $$

其中 $K$ 为块大小，$[\cdot]$ 取块内偏移。显存利用率从预留式近似 $\frac{L_{\text{avg}}}{L_{\max}}$ 提升至接近 $1$（仅末块有少量内部碎片）。共享前缀使 $N$ 个序列的前缀显存由 $N\cdot L_p$ 降为 $L_p$。

## 四、代码实现

```python
# PagedAttention 分配示意（伪代码）
class BlockAllocator:
    def __init__(self, num_blocks):
        self.free = list(range(num_blocks))

    def alloc(self):
        return self.free.pop()          # 取一块物理显存

    def free_block(self, b):
        self.free.append(b)

# 序列维护逻辑块->物理块映射（类似页表）
class Sequence:
    def __init__(self):
        self.block_table = []

    def append_token(self, alloc: BlockAllocator):
        if len(self.block_table) == 0 or self.full():
            self.block_table.append(alloc.alloc())
```

## 五、与其他技术对比

| 方式 | 显存利用率 | 共享 | 碎片 |
|------|------------|------|------|
| 连续预留 | 低 | 否 | 严重 |
| PagedAttention | 近 100% | 是 | 极小 |

分页以「块表映射」的轻微开销换巨大并发提升。

## 六、常见误区

- 分页更慢：块表寻址开销极小，远小于碎片浪费的代价。
- 只省显存：更关键的是提升并发从而提吞吐。
- 无需共享：多轮对话/批量共用前缀时共享收益显著。

## 七、与开源书·权威来源对应

- vLLM PagedAttention 论文与代码：https://github.com/vllm-project/vllm
- llm-course（mlabonne）：https://github.com/mlabonne/llm-course

## 八、面试题

- PagedAttention 如何解决显存碎片？
- 块表（block table）的作用是什么？
- 前缀共享在分页下如何实现？

## 九、演进与趋势

连续预留 → 分页（PagedAttention）→ 前缀共享（RadixAttention）→ 与 KV 量化、注意力卸载结合。趋势是把显存管理做成「类 OS 虚拟内存」的统一抽象。

与 KV 量化结合时，分页块成为量化的最小单元，块内统一量化参数可进一步压缩显存，代价是微弱精度损失，需按层敏感度选择。

在长上下文场景，分页还能配合「KV 卸载（offload）」把不活跃块暂存到 CPU/磁盘，用带宽换容量，支撑超长序列推理。

## 十、小结

PagedAttention 把操作系统分页智慧搬到 KV 缓存，以「按需分块 + 页表映射 + 前缀共享」几乎消除碎片、大幅提升并发，是现代推理引擎的基石。
