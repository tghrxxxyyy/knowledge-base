# SSD算法框架

> 对应 Dao & Gu, Mamba2, 2024；核心为半可分矩阵的分块并行算法。

## 一、背景与挑战

半可分矩阵朴素乘为 $O(nN^2)$，需分块把大矩阵乘卸载到 GPU 张量核，同时维护跨块状态。

## 二、核心原理

将序列分为块，块内用普通矩阵乘（半可分可表示为低秩修正），块间以状态递推传递，整体近线性且高度并行。

## 三、数学形式

设块长 $B$，块内复杂度 $O(B^2N)$、块间 $O((n/B)N^2)$；选 $B\approx\sqrt n$ 平衡，总约 $O(nN\sqrt n)$ 的友好形式（实践中按硬件调）。

## 四、代码实现

```python
state = zeros(N)
for blk in chunks(x, B):
    Y = L_blk @ blk + outer(state, prefix)
    state = Abar_blk @ state + Bbar_blk @ blk
```

## 五、与其他对比

- 比 Mamba1 的纯扫描更利于张量核，吞吐更高。
- 与 FlashAttention 思想相似：分块+重算换 IO 效率。

## 六、常见误区

- 块大小随意；过大失并行、过小增状态传递开销。
- 误以为 SSD 改变数学模型；只改变计算分解。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- SSD 为何快于朴素扫描？答：分块用矩阵乘上张量核，块间仅传小状态，并行度更高。

## 九、演进

串行前缀扫描 → 分块半可分乘 → 硬件最优 SSD。

## 十、小结

SSD 用半可分分块算法把 SSM 计算搬到 GPU 张量核，实现高吞吐。
