# 注意力头AllToAll并行

> 对应 Shoeybi 2019 (Megatron) 与 Vaswani 2017 多头注意力切分。

## 一、背景与挑战
多头注意力有 $H$ 个头，天然可沿头维切分到多卡。但自注意力内部需完整序列的 QK^T，涉及序列维通信。

## 二、核心原理
每卡持若干头，本地算 $Q_i,K_i,V_i$ 得头输出；拼接所有头前需 all-to-all 交换使每卡收集完整头集。序列并行下 QK^T 还需跨卡 all-to-all 交换序列块。

## 三、形式化与数学基础
头并行：$ \\mathrm{head}_i = \\mathrm{Attn}(Q_i,K_i,V_i) $，
融合前交换：
$ \\mathrm{out} = \\mathrm{Concat}(\\mathrm{head}_1,\\dots,\\mathrm{head}_H) W_O $，
序列并行用 all-to-all 将序列维 $S$ 分块，$Q_{s\\to r}$ 在各卡间重排。

## 四、代码实现
```python
import torch
import torch.distributed as dist
# 序列并行：all-to-all 交换序列块
q_split = q.chunk(world_size, dim=1)        # 按序列切块
q_recv = [torch.empty_like(q_split[0]) for _ in range(world_size)]
dist.all_to_all(q_recv, list(q_split))      # 重排使每卡持有完整头的不同序列
```

## 五、与其他技术对比
头并行是 TP 的一部分；序列并行用 all-to-all 扩展切分维，与头并行互补。TP 的 all-reduce 在输出投影前。

## 六、常见误区
误区一：头并行无通信——融合需 all-to-all 或 all-reduce。误区二：头数任意切——须被 world_size 整除。误区三：序列并行与头并行相同，实为不同切分维。

## 七、与开源书/权威来源对应
Shoeybi 2019 Megatron；Korthikanti 2022 序列并行用 all-to-all。

## 八、面试题
问：注意力如何张量并行？答：按头切 + 输出投影行并行。问：all-to-all 用途？答：序列/头维重排。

## 九、演进与趋势
上下文并行(context parallel)沿序列 all-to-all；与 flash-attention 融合降显存。

## 十、小结
注意力并行在头与序列两维均需 all-to-all，是 TP 通信密集处。
