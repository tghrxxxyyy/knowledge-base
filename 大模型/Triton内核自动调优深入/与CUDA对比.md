# Triton与CUDA对比

> 对应 Triton vs 手写 CUDA 的取舍（社区经验）。

## 一、背景与挑战

选型需权衡开发成本、峰值性能与可维护性。

## 二、核心原理

Triton 高层抽象快、易改、自动处理合并/共享内存，但极端优化（如手工指令级调度、复杂 reduction）仍 CUDA 更灵活；多数融合内核 Triton 已足。

## 三、数学形式

开发成本 $C_{Tri}\ll C_{CUDA}$；峰值 $P_{CUDA}\ge P_{Tri}$，差距随内核复杂度缩。

## 四、代码实现

```python
# Triton 数十行实现 fused softmax
# CUDA 需数百行含共享内存/同步
```

## 五、与其他对比

- 与 张量核心与混合精度推理深入：两者都能用 TC。
- 与 推理CUDA图优化深入：生成的 kernel 都可入图。

## 六、常见误区

- 认为 Triton 写不出高性能（常见内核已够快）。
- 用 Triton 硬刚高度定制 kernel 反而不利。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 何时仍用 CUDA？答：需极致峰值或特殊指令/同步，Triton 抽象不够时。

## 九、演进

纯 CUDA → Triton 主导融合 → 混合。

## 十、小结

Triton 覆盖多数推理内核且开发快，CUDA 保留给极限优化。
