# RetNet 与线性递归

> 对应 Sun et al., *Retentive Network (RetNet): A Successor to Transformer for Large Language Models*, 2023（arXiv:2307.08621）。属模型架构演进板块，讨论挑战 Transformer 注意力的线性递归路线。

## 一、背景与挑战

Transformer 自注意力虽强，却有两大痛点：训练时复杂度 $O(T^2)$ 显存/算力随序列平方增长；推理时需缓存全部历史的 KV，导致长序列下显存与带宽压力陡增。线性注意力/状态空间模型（如 SSM、Linear Attention）试图用「递归」把推理降为 $O(1)$ 内存。RetNet 提出**多尺度 retention**机制，目标是一举兼顾：训练可**并行**（好训练）、推理可**递归**（好部署）、且表达力不输注意力。

## 二、核心原理

RetNet 用 retention 替代 softmax 注意力，核心是三点：
1. **指数衰减递归**：对历史状态施加随时间衰减的加权，越近越重要，使信息可压缩进固定大小状态。
2. **多尺度（multi-scale）**：用不同衰减率（γ）并行的多个 retention 头，捕捉短程与长程不同时间尺度，类似多分辨率。
3. **双模式统一**：
   - **并行模式**：分块（chunkwise）计算，训练时可像注意力一样并行，复杂度近线性。
   - **递归模式**：推理时按时间步更新状态，无需 KV 缓存，内存恒定。

其巧妙在于同一套参数可在两种模式下等价计算，既好训练又好推理。

## 三、形式化与数学基础

retention 对查询 $Q$、键 $K$、值 $V$ 定义带衰减的递归。并行形式（简化）：

$$
S_t = \sum_{n\le t} \gamma^{\,t-n}\, K_n^\top V_n, \qquad
\text{retention}_t = Q_t\, S_t
$$

其中 $\gamma\in(0,1]$ 为衰减率（多尺度即多组 $\gamma$）。递归形式一步更新：

$$
S_t = \gamma\, S_{t-1} + K_t^\top V_t, \qquad o_t = Q_t S_t
$$

并行模式复杂度约 $O(T^2 d)$ 但可做 chunkwise 分块近似 $O(T d^2)$；递归模式每步 $O(d^2)$，内存 $O(d^2)$ 恒定，无 KV 膨胀。与 softmax 注意力对比，retention 去掉非线性归一化的全局依赖，换得以递归表达的可能。

## 四、代码实现（递归推理）

```python
def retnet_step(q, k, v, state, gamma=0.9):
    # state: 累积的 (K^T V) 矩阵，形状 (d, d)
    state = gamma * state + k.T @ v          # 指数衰减递归更新
    out   = q @ state                         # 当前输出
    return out, state

# 推理：逐 token，内存恒定，无需 KV 缓存
state = torch.zeros(d, d)
for t, (q, k, v) in enumerate(stream()):
    o, state = retnet_step(q, k, v, state, gamma=GAMMAS[head])
```

## 五、与其他技术对比

| 架构 | 训练 | 推理内存 | 表达力 | 代表 |
|------|------|---------|--------|------|
| softmax 注意力 | 并行 $O(T^2)$ | 随 T 增(KV) | 强 | Transformer |
| 线性注意力 | 并行 | 低 | 中 | Linear Transformer |
| SSM (Mamba) | 并行(核) | 恒定 | 强 | Mamba |
| RetNet | 并行/递归双模 | 恒定 | 强 | RetNet |

RetNet 的卖点是「训练并行、推理递归」同一参数两用。

## 六、常见误区

- 以为「线性递归」完全免费：多尺度与 chunkwise 带来实现复杂度与近似误差。
- 混淆 RetNet 与 SSM：RetNet 用显式衰减递归 + retention，Mamba 用连续状态空间参数化，机制不同。
- 忽略衰减率 γ 的选择：γ 过小丢长程、过大退化为无衰减。
- 把「无 KV 缓存」等同于「无损」：递归压缩本身是有损近似。

## 七、与开源书·权威来源对应

- Sun et al., *Retentive Network (RetNet)*, 2023（微软）。
- 同族：Katharopoulos et al. *Transformers are RNNs*（线性注意力）、Gu & Dao *Mamba*（2023）。
- 本知识库「架构选型指南」提供横向取舍视角。

## 八、面试题

- RetNet 如何兼顾训练并行与推理高效？两套模式为何等价？
- retention 的指数衰减有何作用？γ 过大/过小会怎样？
- RetNet 与 Mamba/线性注意力本质区别？
- 「无 KV 缓存」是否意味着无损？递归压缩的代价是什么？

## 九、演进与趋势

RetNet 是「Transformer 替代路线」的重要一环，与 Mamba、RWKV、GLA 等共同构成「线性递归/状态空间」家族。后续工作把 retention 与混合架构结合（如在 Transformer 层间插入递归层）、并探索门控与门控线性注意力（GLA）提升长程保持。趋势不是彻底取代 Transformer，而是在「超长序列、端侧、流式」场景用线性递归补位，形成「注意力 + 递归」的混合主干（如 Samba）。

## 十、小结

RetNet 用多尺度 retention 以「指数衰减递归」替代 softmax 注意力，关键创新是同一参数支持训练并行（chunkwise）与推理递归（恒定内存）双模式，从而既好训练又免 KV 缓存膨胀。它与 Mamba、线性注意力等同属挑战 Transformer 序列效率垄断的线性递归家族，适合超长序列与端侧场景，但实现与近似误差需权衡，趋势是与注意力混合共存。
