# ZeRO-3参数分片与通信

> 对应 Rasley 2020 (DeepSpeed ZeRO 论文) 与 Shoeybi 2019 Megatron 对照。

## 一、背景与挑战
ZeRO-3 将参数也分片，达到与 FSDP 同等的显存效率，代价是每层前向 all-gather、反向 reduce-scatter 的密集通信。

## 二、核心原理
每个 rank 常驻参数分片；计算某层时 all-gather 拼回完整参数，用后丢弃；反向对称 reduce-scatter。参数分片使单卡显存降至近 $\\Psi/N$ 量级。

## 三、形式化与数学基础
显存：
$ M \\approx (K+1)\\Psi/N + \\mathrm{act} $，
通信量每步约 $2L\\cdot \\Psi$ (gather + scatter，$L$ 层数)，随层数线性增长。

## 四、代码实现
```python
ds_config = {
  "zero_optimization": {
    "stage": 3,
    "offload_optimizer": {"device": "none"},
    "stage3_gather_16bit_weights_on_model_save": True,
  },
}
# 保存时聚合成 fp16 权重
```

## 五、与其他技术对比
等价于 PyTorch FSDP；DeepSpeed 额外提供 `stage3_max_live_parameters` 等细控显存。Megatron 张量并行与其正交，可叠加。

## 六、常见误区
误区一：ZeRO-3 无显存峰值——gather 时仍占整层。误区二：参数分片后优化器可全局更新——实际各 rank 仅更新本地分片。误区三：与 TP 冲突，实际常组合成 3D 并行。

## 七、与开源书/权威来源对应
microsoft/DeepSpeed stage=3；Shoeybi 2019 讨论参数分片与张量并行互补。

## 八、面试题
问：ZeRO-3 通信模式？答：前向 all-gather 参数、反向 reduce-scatter 梯度。问：与 FSDP 区别？答：实现框架不同，分片语义一致。

## 九、演进与趋势
ZeRO-3 与 tensor parallel、pipeline 组合成 3D 并行；向 NVMe offload 扩展。

## 十、小结
ZeRO-3 是显存压缩的极限档，以通信换空间，是训练超大模型的主力。
