# 序列并行与AllToAll

> 对应 Korthikanti 2022 (Reducing Activation Recomputation) 与 Shoeybi 2019。

## 一、背景与挑战
张量并行沿隐藏维切分，但层归一化与 dropout 的输入仍需完整，导致激活沿序列维复制。序列并行沿序列维切分以省激活。

## 二、核心原理
将序列长度 $S$ 切到各卡，LayerNorm/GELU 在局部序列块计算；跨序列的操作(如 QK^T)经 all-to-all 收集完整序列。列并行层输入按序列切，行并行层输出按序列切。

## 三、形式化与数学基础
激活显存由 $O(S\\cdot h)$ 降为 $O(S/n\\cdot h)$，其中 $n$ 为序列并行度。通信：每次需 all-to-all 交换序列块，量 $O(S\\cdot h)$。

## 四、代码实现
```python
import torch
import torch.distributed as dist
# 序列并行 LayerNorm 在局部序列块
x_local = x.chunk(world_size, dim=1)[rank]
x_norm = torch.nn.functional.layer_norm(x_local, (h,))
# 进入注意力前 all-to-all 收集完整序列
gather = [torch.empty_like(x_local) for _ in range(world_size)]
dist.all_to_all(gather, list(x_local.chunk(world_size, dim=1)))
```

## 五、与其他技术对比
序列并行补充 TP 的隐藏维切分，专门压激活；与重计算正交。TP+SP 常组合称"张量+序列并行"。

## 六、常见误区
误区一：序列并行省参数——不，只省激活。误区二：无 all-to-all——跨序列操作为必需。误区三：与上下文并行同义，实际上下文并行专指注意力序列切。

## 七、与开源书/权威来源对应
Korthikanti 2022 序列并行；Shoeybi 2019 Megatron 讨论激活。

## 八、面试题
问：序列并行切什么？答：序列长度维，省激活。问：为何需 all-to-all？答：跨序列的注意力/归一化需完整序列。

## 九、演进与趋势
与 fp8 激活、选择性重算结合；成为长上下文训练标配。

## 十、小结
序列并行沿序列维扩展，与 TP 互补，是长序列训练显存优化关键。
