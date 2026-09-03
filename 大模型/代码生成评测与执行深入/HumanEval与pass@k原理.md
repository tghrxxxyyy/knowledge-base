# HumanEval与pass@k原理

> 对应 Chen et al. 2021 "Evaluating Large Language Models Trained on Code" (HumanEval 与 pass@k)。

## 一、背景与挑战

代码生成需从自然语言描述生成函数体，评测难点是"功能正确"无法靠文本匹配判定，必须执行测试用例。HumanEval 以 164 道手写题配隐藏单测建立执行式评测范式。

## 二、核心原理

每题给函数签名与文档串，模型补全函数，用一套单元测试执行判定。指标为 pass@k：采样 k 次至少一次通过全部测试。强调执行而非文本相似。

## 三、数学形式

无偏 pass@k：

$$
\mathrm{pass@k}=1-\frac{\binom{n-c}{k}}{\binom{n}{k}}
$$

其中 n 次采样中 c 次通过。

## 四、代码实现

```python
from math import comb

def pass_at_k(n, c, k):
    if n < k:
        return 0.0
    return 1.0 - comb(n - c, k) / comb(n, k)

print(pass_at_k(100, 30, 1))
```

## 五、与其他对比

相比 BLEU/编辑距离（文本相似），pass@k 直接测功能正确性；相比 MBPP（更短题），HumanEval 更重算法与边界。

## 六、常见误区

误区一：把 pass@1 当唯一指标忽略上限。误区二：用文本相似替代执行。误区三：测试可见导致过拟合（HumanEval 测试隐藏）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：为何代码评测要执行而非文本匹配？答：功能正确与文本相似弱相关，执行可判定行为。
- Q：pass@k 含义？答：采样 k 次至少一次通过全部测试的概率。

## 九、演进

HumanEval 催生执行式评测主流，并衍生 MBPP、LiveCodeBench、BigCodeBench 等。

## 十、小结

HumanEval 以隐藏单测 + pass@k 确立代码评测"执行即真理"的原则。
