# FlashAttention2 与对比

> 对应 Dao, *FlashAttention-2*, 2023（更好并行与占用）。

## 一、背景与挑战

v1 在反向与 warp 间负载不均，GPU 利用率未拉满。

## 二、核心原理

v2 把外积并行改为内积并行、减少非矩阵乘指令、平衡 warp 任务、更优 Q 分块；前向更快、反向显存更省。

## 三、数学形式

同样 $O(N^2)$ 计算但矩阵乘占比提升，算术强度更高，HBM 访问更少。

## 四、代码实现

```python
# 调用层不变，仅后端升级
y = flash_attn_func(q, k, v, causal=True)
```

## 五、与其他对比

- 比 v1 更快且省反向显存；
- 与 内存高效注意力总览 同系列。

## 六、常见误区

- 以为 v2 改变数值（等价）；
- 旧驱动/cuDNN 不兼容致回退到慢路径。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- v2 改进点？答：并行策略与 warp 负载优化，提升 MFU、降反向显存。

## 九、演进

v1 → v2 → v3（Hopper FP8）。

## 十、小结

FlashAttention2 同结果下更高利用率，是长上下文训练默认选择。
