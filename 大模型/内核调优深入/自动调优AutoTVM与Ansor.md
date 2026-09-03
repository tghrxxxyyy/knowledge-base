# 自动调优AutoTVM与Ansor

> 对应 Zheng et al., *Ansor: Generating High-Performance Tensor Programs*, OSDI 2020；与 编译部署深入 衔接。

## 一、背景与挑战

手工调优 kernel 成本高且难以泛化到不同 shape/硬件。

## 二、核心原理

AutoTVM 在固定结构搜索调度参数（tile/order/unroll）；Ansor 用 sketch+annotate 自动生成结构再微调，覆盖更广。

## 三、数学形式

搜索目标 $\min_{s\in\mathcal S} T(s)$；代价模型 $\hat T(s)\approx T(s)$ 用 XGBoost 加速评估。

## 四、代码实现

```python
tuner = autotvm.tuner.XGBTuner(task)
tuner.tune(n_trial=2000, measure_option=...)
```

## 五、与其他对比

- 与 算子融合深入（融合后需调优）接力。
- 与 内核调优总览（手工调优）对照自动化。

## 六、常见误区

- 搜索空间太大导致调优时间爆炸，需限定 key shape。
- 迁移到不同 GPU 后最优配置失效。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Ansor 比 AutoTVM 强在哪？答：自动生成计算结构（sketch）而非仅搜参数，覆盖更广。

## 九、演进

模板搜索 → AutoTVM → Ansor → 学习型编译器。

## 十、小结

自动调优把专家经验转为搜索，是跨硬件泛化的关键。
