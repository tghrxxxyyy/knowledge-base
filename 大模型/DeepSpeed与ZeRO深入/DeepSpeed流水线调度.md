# DeepSpeed流水线调度

> 对应 Huang 2019 (GPipe) 与 Narayanan 2019 (PipeDream) 及 microsoft/DeepSpeed。

## 一、背景与挑战
单纯数据并行受显存与批量限制，流水线并行将模型按层切到多设备，用微批次填充气泡。DeepSpeed 支持 1F1B 等调度。

## 二、核心原理
模型纵向切为 $p$ 个 stage，小批量拆成 $m$ 个微批次先后流入。朴素 fill-drain 先跑完所有前向再反向；1F1B 在稳定期每个设备交替执行一次前向与一次反向，减少激活峰值。

## 三、形式化与数学基础
气泡比：
$ b = \\frac{(p-1)}{m+p-1} $，
当 $m\\gg p$ 时气泡可忽略。激活显存 1F1B 为 $O(m\\cdot \\mathrm{act}_{\\mathrm{stage}})$ 而非 $O(m\\cdot p)$。

## 四、代码实现
```python
ds_config = {
  "train_micro_batch_size_per_gpu": 4,
  "gradient_accumulation_steps": 16,
  "pipe": {"micro_batch_size": 1},   # 配合 pipeline engine 使用
}
# model = deepspeed.PipelineModule(layers, loss_fn=...)
```

## 五、与其他技术对比
DeepSpeed 1F1B 与 Megatron 类似；GPipe 用全前向再全反向，激活占用更高但实现简单。

## 六、常见误区
误区一：微批次越多越快——受气泡公式，过小反而空闲。误区二：pipeline 与 tensor parallel 互斥，实际常组合。误区三：1F1B 无通信，仍跨 stage 传激活。

## 七、与开源书/权威来源对应
microsoft/DeepSpeed pipeline；Shoeybi 2019 与 Narayanan 2021 论述调度。

## 八、面试题
问：1F1B 为何省激活？答：稳定期每个设备只持少量微批次的激活。问：气泡由何决定？答：stage 数 $p$ 与微批数 $m$。

## 九、演进与趋势
交错 1F1B 进一步压缩气泡；与 ZeRO-3 组合成 3D 并行。

## 十、小结
流水线调度以微批次掩盖设备空闲，是大模型跨设备扩展的必备组件。
