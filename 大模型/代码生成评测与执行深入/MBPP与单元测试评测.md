# MBPP与单元测试评测

> 对应 Austin et al. 2021 "Program Synthesis with Large Language Models" (MBPP)。

## 一、背景与挑战

MBPP 含约 974 道入门级 Python 题，每题配 3 个手写断言。挑战是入门题易饱和、断言少可能漏掉边界、且需防训练数据包含题面。

## 二、核心原理

模型生成函数后用断言执行。评测同样用 pass@k。与 HumanEval 互补：MBPP 更偏基础编程理解，题量更大更统计稳健。

## 三、数学形式

单次通过率：

$$
\mathrm{pass@1}=\frac{1}{N}\sum_{i=1}^{N}\mathbf{1}[t_i=1]
$$

带断言覆盖加权：

$$
w_i=\frac{|\mathrm{assert}_i|}{|\mathrm{assert}_{\max}|}
$$

## 四、代码实现

```python
def run_asserts(fn, cases):
    return all(fn(*c[0]) == c[1] for c in cases)

cases = [((2,3),5), ((0,0),0), ((-1,1),0)]
print(run_asserts(lambda a,b: a+b, cases))
```

## 五、与其他对比

相较 HumanEval（算法重），MBPP 更基础、题量更大；相较 LiveCodeBench（防污染），MBPP 较旧易泄漏。

## 六、常见误区

误区一：MBPP 高分即工程能力强（仅入门）。误区二：3 断言足够（边界可能漏）。误区三：忽略题面污染。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Q：MBPP 与 HumanEval 区别？答：MBPP 基础入门题多，HumanEval 算法边界重。
- Q：断言少的风险？答：边界与异常路径可能未被覆盖导致误判通过。

## 九、演进

MBPP 与 HumanEval 共同成为代码评测双基准，后续被更抗污染的连续基准补充。

## 十、小结

MBPP 以较大题量与入门定位补充 HumanEval，是代码功能评测的统计稳健组成。
