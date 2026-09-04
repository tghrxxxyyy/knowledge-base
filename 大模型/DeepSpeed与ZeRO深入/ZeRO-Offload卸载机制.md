# ZeRO-Offload卸载机制

> 对应 Ren 2021 (ZeRO-Offload 论文) 与 microsoft/DeepSpeed 实现。

## 一、背景与挑战
当 GPU 显存即便 ZeRO-3 仍不足时，可将优化器状态与梯度卸载至 CPU，由 CPU 执行更新，以 PCIe 带宽换显存容量。

## 二、核心原理
ZeRO-Offload 将分片参数保存在 GPU、优化器状态与梯度放 CPU；反向后梯度拷贝至 CPU，CPU Adam 更新 fp32 主副本，结果拷贝回 GPU 参与下一前向。

## 三、形式化与数学基础
GPU 显存：
$ M_{\\mathrm{gpu}} \\approx \\Psi/N_{\\mathrm{dp}} + \\mathrm{act} $，
每步额外 CPU-GPU 传输 $2\\Psi$ (梯度下、参数上)，受 PCIe 带宽 $B$ 限制，时间增量约 $2\\Psi/B$。

## 四、代码实现
```python
ds_config = {
  "zero_optimization": {
    "stage": 2,
    "offload_optimizer": {"device": "cpu", "pin_memory": True},
  },
  "optimizer": {"type": "AdamW", "params": {"lr": 1e-4}},
}
```

## 五、与其他技术对比
FSDP 的 CPUOffload 思路一致；DeepSpeed 集成融合 CPU Adam 内核降低开销。NVMe offload 进一步扩大到磁盘。

## 六、常见误区
误区一：offload 一定可行——PCIe 瓶颈使大批量时 GPU 空转。误区二：参数也常驻 CPU——默认仅状态/梯度卸载。误区三：CPU 优化器精度低，实际用 fp32 主副本保精度。

## 七、与开源书/权威来源对应
microsoft/DeepSpeed ZeRO-Offload；Ren 2021 给出 CPU Adam 融合内核设计。

## 八、面试题
问：Offload 卸载了什么？答：优化器状态与梯度(可选参数)。问：瓶颈在哪？答：PCIe 与 CPU 算力。

## 九、演进与趋势
ZeRO-Infinity 将状态分级驻留 GPU/CPU/NVMe，按生命周期调度。

## 十、小结
Offload 是显存极致压缩手段，代价是主机端传输与计算，适合显存严重受限且可容忍降速的训练。
