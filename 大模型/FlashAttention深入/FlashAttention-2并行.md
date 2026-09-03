# FlashAttention-2 并行

> 对应 Dao, *FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning*, 2023。

## 一、背景与挑战

FlashAttention-1 受限于非矩阵乘操作（softmax 归一化）与线程束（warp）间通信，GPU 计算单元未吃满。

## 二、核心原理

FA-2 重新划分并行：在序列长度上并行（而非注意力头），减少 warp 间通信；把非矩阵乘的归一化移到外层，让内部几乎全是 GEMM，提升 Tensor Core 利用率与 Occupancy。

## 三、数学形式

将前向拆为外层（处理 $Q$ 块的归一化状态）与内层（纯 $KV$ 块 GEMM）；并行度 $P\approx b\cdot h\cdot \lceil n/B\rceil$，更好映射到 GPU block。

## 四、代码实现

```python
# 概念：沿 seq 维并行，内层纯 matmul
for q_tile in split(Q, B):                 # 外层处理归一化
    acc = online_softmax(q_tile, K_tiles, V_tiles)   # 内层 GEMM
```

## 五、与其他对比

- 与 FlashAttention-1 相比约 2× 提速，更贴 A100 峰值。
- 与 线性注意力深入 仍是精确 vs 近似的区别。

## 六、常见误区

- 认为升级自动生效；需注意 API 版本与 causal/非 causal 支持。
- 在老架构上 FA-2 收益有限。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- FA-2 比 FA-1 快在哪？答：更好的并行划分与把非矩阵乘移外层，最大化 Tensor Core 利用率。

## 九、演进

FA-1(IO感知) → FA-2(并行/work划分) → FA-3(Hopper WGMMA/异步)。

## 十、小结

FA-2 通过并行与计算划分逼近硬件峰值，是长上下文训练的关键加速器。
