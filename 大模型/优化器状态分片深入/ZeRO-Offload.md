# ZeRO-Offload

> 对应 Rajbhandari et al., *ZeRO-Offload*, 2021；与 优化器状态分片深入 衔接。

## 一、背景与挑战

即使分片，巨模型仍超 GPU 显存；Offload 把状态卸到 CPU 内存。

## 二、核心原理

将优化器状态与部分计算（如 Adam 更新）移到 CPU，GPU 只做前向/反向，以 PCIe 带宽换显存。

## 三、数学形式

显存降至 $O(\Phi)$ 级别；代价是 CPU-GPU 传输 $O(\Phi)$ 每步，受带宽制约。

## 四、代码实现

```python
cfg["zero_optimization"]["offload_optimizer"] = {"device": "cpu"}
```

## 五、与其他对比

- 与 ZeRO-3深入 可组合（分片+卸载）。
- 与 混合精度深入 共用于省显存。

## 六、常见误区

- 卸载致 CPU 计算成为瓶颈，整体变慢。
- 误以为 offload 不影响吞吐。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Offload trade-off？答：显存大降，但 CPU-GPU 传输增延迟，需带宽充足。

## 九、演进

纯 GPU → Offload 优化器 → Offload 参数/梯度。

## 十、小结

ZeRO-Offload 用 CPU 内存突破显存墙，代价是传输带宽与吞吐。
