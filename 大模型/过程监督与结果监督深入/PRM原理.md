# 过程监督（PRM）原理

> 对应 Process Reward Model。

## 一、背景与挑战

需逐步正确性信号，标注每步对/错/部分对。

## 二、核心原理

PRM 对推理第 $t$ 步状态 $s_t$ 预测正确性；训练用逐步标注；推理时累加/乘步骤分选路径。

## 三、数学形式

$P(correct|s_t)$ 逐步概率；路径分 $S=\sum_t \log P_t$ 或乘积；beam 选最大。

## 四、代码实现

```python
probs = [prm(step_state(s[:i])) for i in range(1,T+1)]
path = beam_search(steps, score=lambda p: sum(probs))
```

## 五、与其他对比

- 与 ORM 对照；反馈更密集。
- 与 大模型数学深入（推理任务）衔接。

## 六、常见误区

- 步边界不统一致标签噪声。
- 推理用 PRM 成本高（每步打分）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- PRM 推理如何用？答：对每步打分，累积分选最优推理路径（常配 beam）。

## 九、演进

人工标步 → 自举（模型标步）→ 树搜索结合。

## 十、小结

PRM 提供逐步信号，显著提升复杂推理可靠性。
