# CUDA图总览

> 对应 NVIDIA CUDA Graphs（CUDA 10+）；广泛用于 Triton/TensorRT-LLM/vLLM 减启动开销。

## 一、背景与挑战

每次 kernel 启动经宿主 CPU 入队，小算子多时启动开销（enqueue latency）占 decode 步时间比例高，限制单步吞吐。

## 二、核心原理

CUDA Graph 把一串 kernel 及其依赖预先录制成图，之后以单条 API 重放（launch），省去每步 CPU 端逐 kernel 下发与驱动开销。

## 三、数学形式

常规步延迟 $L_{step}=\sum_i (o_{launch}+t_{kernel,i})$；图重放 $L_{step}\approx o_{replay}+\sum_i t_{kernel,i}$，省 $\sum o_{launch}$。

## 四、代码实现

```python
g = cuda.graph()
with g.capture():
    out = model.step(x, kv)
g.replay()
```

## 五、与其他对比

- 与 迭代级批处理调度深入 互补：图减启动开销、调度组批。
- 与 张量核心与混合精度推理深入 不冲突。

## 六、常见误区

- 误以为图能提速 kernel 本身（只省启动开销）。
- 忽视图捕获需固定控制流与形状。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- CUDA Graph 省的是什么？答：省 CPU 逐 kernel 启动/驱动下发开销，不改 kernel 计算。

## 九、演进

逐 kernel 启动 → 流捕获 → 完整图重放。

## 十、小结

CUDA Graph 用录制重放消除启动开销，是低延迟小 batch 推理的标配。
