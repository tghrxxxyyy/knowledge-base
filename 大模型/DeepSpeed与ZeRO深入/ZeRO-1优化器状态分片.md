# ZeRO-1优化器状态分片

> 对应 Rasley 2020 (DeepSpeed ZeRO 论文) 与 microsoft/DeepSpeed 实现。

## 一、背景与挑战
数据并行下每个 rank 复制完整优化器状态(对 Adam 为 12Ψ 中的 8Ψ)，是显存主要开销。ZeRO-1 仅分片优化器状态，参数与梯度仍复制。

## 二、核心原理
ZeRO-1 将 $m,v$ 沿数据并行维度分片，每 rank 仅更新本地分片对应参数；梯度经 all-reduce 后各 rank 持有相同全局梯度，再各自更新分片状态。

## 三、形式化与数学基础
分片后优化器状态显存：
$ M_{\\mathrm{opt}} = 12\\Psi - 8\\Psi + 8\\Psi/N = 4\\Psi + 8\\Psi/N $，
参数梯度仍为 $2\\Psi$。当 $N$ 大时趋近 $4\\Psi+2\\Psi$。

## 四、代码实现
```python
# deepspeed 配置片段
ds_config = {
  "zero_optimization": {
    "stage": 1,            # 仅分片优化器状态
  },
  "optimizer": {"type": "AdamW", "params": {"lr": 1e-4}},
}
# engine = deepspeed.initialize(model, config=ds_config)
```

## 五、与其他技术对比
相对 ZeRO-2/3 通信量最小、显存节省最少；适合中等模型且通信受限场景。FSDP 默认等效 ZeRO-3，粒度更细。

## 六、常见误区
误区一：ZeRO-1 也分片参数——不，它只分片状态。误区二：分片后各 rank 权重不同——更新后需 all-gather 参数才一致(通常下一步前同步)。

## 七、与开源书/权威来源对应
microsoft/DeepSpeed `zero_optimization.stage=1`；Rasley 2020 定义三档分片。

## 八、面试题
问：ZeRO-1 省了哪部分显存？答：优化器状态 $8\\Psi$ 降至 $8\\Psi/N$。问：为何梯度仍需复制？答：每 rank 需全局梯度更新本地状态。

## 九、演进与趋势
ZeRO-1 作为基础档，常与 offload、梯度累积组合。

## 十、小结
ZeRO-1 以最小改动降低优化器状态显存，是显存/通信权衡的第一档。
