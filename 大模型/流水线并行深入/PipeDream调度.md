# PipeDream 1F1B 调度

> 对应 Harlap et al., 《PipeDream: Fast and Efficient Pipeline Parallel DNN Training》, 2019；Narayanan et al., 2021。

## 一、背景与挑战

GPipe 先全前向再全反向，气泡大；1F1B 让反向尽早开始以缩短气泡。

## 二、核心原理

每个阶段在收到上游激活即前向，反向就绪即反向（one-forward-one-backward），形成稳定态下每卡持续工作；需保存激活并可能用重计算省显存。

## 三、数学形式

气泡比近似 $\frac{(d-1)}{m+d-1}$（$d$ 阶段数、$m$ 微批）；增大 $m$ 降气泡。

## 四、代码实现

```python
for step in schedule:                 # 1F1B 稳态
    if has_input: a = stage.forward(inp); send(a)
    if has_grad: g = stage.backward(gin); send(g)
```

## 五、与其他对比

- 比 GPipe 气泡小、吞吐高，但实现复杂、需管理激活版本。
- 与 混合并行深入 常配合 3D 并行。

## 六、常见误区

- 忘记激活版本导致用错前向输出。
- 微批次数与阶段数不匹配致稳态未达。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 1F1B 为何气泡更小？答：反向尽早启动，稳态每卡持续前后向，空闲仅首尾。

## 九、演进

GPipe → 1F1B → 1F1B 重计算。

## 十、小结

PipeDream 1F1B 以尽早反向显著降气泡，是主流流水调度。
