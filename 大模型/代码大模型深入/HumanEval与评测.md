# HumanEval 与评测

> 见「代码大模型深入/代码模型总览」与「模型评测指标深入」。

## 一、背景与挑战

代码能力需可执行评测而非文本相似。

## 二、核心原理

HumanEval 给函数签名与 docstring，要求生成实现，用隐藏单测 pass@k 评测；MBPP 类似用自然语言描述。

## 三、数学形式

```
pass@k = 1 - C(n-c,k)/C(n,k)
```

c 为通过样本数。

## 四、代码实现

```python
import human_eval
for p in human_eval.read_problems(): test(p)
```

## 五、关键要点

- 防数据污染（题在训练集）。
- 单测覆盖决定可信度。

## 六、与其他对比

- BLEU 不可靠；执行测试才可信。

## 七、常见误区

- 得满分=工程可用——缺集成测试。

## 八、与开源书对应

- HumanEval: https://github.com/openai/human-eval
- Chen et al., 2021.

## 九、面试题

- 为何代码评测用 pass@k 而非 BLEU？

## 十、演进

单测 → 多测 → 仓库级 SWE-bench。

## 十一、小结

可执行评测是代码模型的尺子。
