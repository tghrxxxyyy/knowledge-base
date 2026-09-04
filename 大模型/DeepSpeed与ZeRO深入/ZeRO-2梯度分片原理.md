# ZeRO-2梯度分片原理

> 对应 Rasley 2020 (DeepSpeed ZeRO 论文) 与 microsoft/DeepSpeed 实现。

## 一、背景与挑战
在 ZeRO-1 基础上，梯度也占 $2\\Psi$ 且每步复制冗余。ZeRO-2 进一步分片梯度，跨节点通信略增但显存再降。

## 二、核心原理
反向后梯度经 reduce-scatter 分片，每 rank 仅持有自身参数分片对应的梯度；优化器用该分片梯度更新本地状态，无需全局梯度常驻。

## 三、形式化与数学基础
显存模型：
$ M = 4\\Psi + 2\\Psi/N + 8\\Psi/N = 4\\Psi + 10\\Psi/N $，
其中 $4\\Psi$ 为 fp16 参数与 fp32 主副本，$10\\Psi/N$ 为分片梯度与状态。

## 四、代码实现
```python
ds_config = {
  "zero_optimization": {
    "stage": 2,           # 分片梯度 + 优化器状态
    "allgather_partitions": True,
  },
  "gradient_accumulation_steps": 1,
}
# engine = deepspeed.initialize(model, config=ds_config)
```

## 五、与其他技术对比
比 ZeRO-1 省梯度显存但通信变为 reduce-scatter；比 ZeRO-3 少一次参数 all-gather，故单卡仍常驻完整参数。

## 六、常见误区
误区一：ZeRO-2 分片参数——不，参数仍复制。误区二：reduce-scatter 后无需同步参数——更新本地状态后仍需 all-gather 参数供下一步前向。

## 七、与开源书/权威来源对应
microsoft/DeepSpeed stage=2 文档；Rasley 2020 给出 2Ψ/N 梯度分片收益。

## 八、面试题
问：ZeRO-2 相对 ZeRO-1 多了什么？答：梯度分片(reduce-scatter)。问：何时选 ZeRO-2？答：单卡放得下参数、但状态/梯度显存紧张。

## 九、演进与趋势
ZeRO-2 常与梯度累积、CPU offload 组合以省显存。

## 十、小结
ZeRO-2 在保持完整参数驻留的同时压低梯度与状态显存，是较常用的折中档。
