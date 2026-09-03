# 过程验证器（PRM）

> 对应 Lightman et al., *Let's Verify Step by Step*, 2023（OpenAI）。

## 一、背景与挑战

多步推理中一步错全盘错，需逐步判分。

## 二、核心原理

PRM 对每步给正确概率，逐步累乘得整体；训练需逐步标注（人工/自动）；引导 beam/MCTS 搜索。

## 三、数学形式

$P(correct)=\prod_{t=1}^T p_t$，$p_t=v_\phi(x, y_{1:t})$；搜索选高累积分。

## 四、代码实现

```python
prods = [prod(prm(x, y[:t]) for t in steps(y)) for y in beams]
```

## 五、与其他对比

- 与 ORM（粒度）对照。
- 与 过程监督与结果监督深入（若新增）同源。

## 六、常见误区

- 逐步标注贵且噪声大。
- 累乘放大小步误差。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- PRM 为何强？答：逐步判分定位错误，引导搜索提精度。

## 九、演进

ORM → PRM → 自标注 PRM 规模化。

## 十、小结

PRM 以逐步判分提升推理可靠性，但标注贵。
