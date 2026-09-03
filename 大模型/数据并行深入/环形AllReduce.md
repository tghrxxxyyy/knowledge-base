# 梯度 Ring All-Reduce

> 对应 Baidu, 《Bringing HPC Techniques to Deep Learning》, 2017；Patarasuk & Yuan, 《Bandwidth Optimal All-reduce》, 2009。

## 一、背景与挑战

多卡全量 all-reduce 通信量随卡数线性增，需带宽最优算法。

## 二、核心原理

Ring All-Reduce 把梯度分块，在环上做 reduce-scatter 再 all-gather；每卡只与邻卡通信两次，总通信量 $2(N-1)/N\cdot S$ 与卡数无关。

## 三、数学形式

总通信量 $\approx 2\frac{K-1}{K}S$（$S$ 梯度总字节）；带宽最优、与 $K$ 无关。

## 四、代码实现

```python
# NCCL 默认 ring/tree all-reduce
dist.all_reduce(grad, op=dist.ReduceOp.SUM)
grad.div_(world_size)
```

## 五、与其他对比

- 与 通信压缩深入 正交：先压缩再 all-reduce 可进一步降量。
- 是 数据并行深入 的通信内核。

## 六、常见误区

- 误以为 all-reduce 量随卡数线性增（实际带宽最优为常数级）。
- 小消息用 ring 反不如 tree。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Ring All-Reduce 为何带宽最优？答：分块环上 reduce-scatter+all-gather，总量与卡数无关。

## 九、演进

朴素 gather → ring → tree/硬件融合。

## 十、小结

Ring All-Reduce 是数据并行通信基石，带宽最优。
