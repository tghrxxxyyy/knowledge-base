# 主权重（Master Weights）

> 对应 Micikevicius et al., 2018（FP32 master weights）；框架 AMP 实现。

## 一、背景与挑战

若用 FP16 存权重并累加更新，步长（学习率×梯度）常被舍入为 0，权重长期不更新（“死亡权重”）。

主权重以 FP32 保留一份权威副本，仅用于参数更新，解决累积丢精度。

## 二、核心原理

前向/反向用 FP16 权重副本提速；优化器在 FP32 主权重上减步长；每步后把更新结果 cast 回 FP16 副本。

梯度与动量也可保留在 FP32，进一步减累积误差。

## 三、数学形式

$W_{master}^{fp32}\leftarrow W_{master}^{fp32}-\eta\,g_{fp16}$；再 $W_{fp16}\leftarrow\mathrm{cast}(W_{master}^{fp32})$。

## 四、代码实现

```python
master = [p.float() for p in model.parameters()]   # FP32 主权重
# 优化器更新 master，再 cast 回模型 的 fp16 参数
```

## 五、与其他对比

- 与 优化器状态数值误差深入 衔接，master 即优化器状态的 FP32 版本。
- 与 混合精度溢出检测深入 总览呼应。
- 与 数值下溢与防御 同防低精度累积误差。

## 六、常见误区

- 以为低精度权重也能直接更新（步长被舍）。
- 主权重与副本不同步，致训练漂移。
- 把所有 buffer（如 BN 统计）都升 FP32，徒增显存。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 为何要 master weights？答：FP16 更新步长被舍入，FP32 主副本保更新精度。
- master 放在哪？答：优化器侧的 FP32 权威权重，用于真正更新。

## 九、演进

全 FP16 → FP32 master → BF16 下可放宽（范围够但仍建议 master）。

## 十、小结

主权重以 FP32 副本承接更新，消除低精度更新的舍入累积误差。
