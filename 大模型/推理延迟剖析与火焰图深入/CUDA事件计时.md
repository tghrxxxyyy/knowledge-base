# CUDA事件计时

> 对应 `torch.cuda.Event` 与 Nsight 异步计时。

## 一、背景与挑战

GPU 异步执行，CPU 计时需同步才准；需内核级精确耗时。

## 二、核心原理

用 `cuda.Event` 在流上打点，`elapsed = end-elapsed(start)` 给两事件间 GPU 时间（不含 CPU）；Nsight 提供更细的 kernel/内存级剖析。

## 三、数学形式

内核时间 $t_k = \text{event\_time}(e_{end})-\text{event\_time}(e_{start})$；多 kernel 求和得段耗时。

## 四、代码实现

```python
s=torch.cuda.Event(enable_timing=True); e=torch.cuda.Event(True)
s.record(); y=model(x); e.record(); torch.cuda.synchronize()
print(s.elapsed_time(e))
```

## 五、与其他对比

- 与 推理延迟剖析与火焰图深入：事件计时喂给阶段分解。
- 与 推理CUDA图优化深入：图重放可整体计时。

## 六、常见误区

- 不打 synchronize 致时间含未完成的早前任务。
- 多次 record 同事件覆盖致错。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为何要 synchronize 再读事件？答：GPU 异步，须等流完成事件时间才确定。

## 九、演进

CPU 计时 → Event → Nsight 全栈。

## 十、小结

CUDA Event 提供准确的 GPU 段计时，是量化各阶段的基础。
