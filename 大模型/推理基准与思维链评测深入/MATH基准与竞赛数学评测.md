# MATH基准与竞赛数学评测

> 对应 Hendrycks et al. 2021 "MATH: Measuring Mathematical Problem Solving with the MATH Dataset"。

## 一、背景与挑战

MATH 含 12500 道竞赛题（AMC/AIME 级别），覆盖代数、几何、数论、微积分，难度高、答案常为表达式。挑战是自动评测难、强模型仍远低于人类、步骤正确性难以程序化校验。

## 二、核心原理

每题含题目、类型、难度等级（1-5）与含 LaTeX 的解答。评测用答案规范化匹配（符号等价），并报告各难度分层准确率，从而诊断模型能力边界。

## 三、数学形式

难度分层加权准确率：

$$
\mathrm{Acc}_w=\sum_{l=1}^{5} w_l \cdot \mathrm{Acc}_l,\quad \sum_l w_l=1
$$

答案符号等价判定常用 SymPy：

$$
\mathrm{eq}(a,b)=\mathtt{simplify}(a-b)\stackrel{?}{=}0
$$

## 四、代码实现

```python
import sympy as sp

def equiv(a, b):
    return sp.simplify(sp.sympify(a) - sp.sympify(b)) == 0

print(equiv("x**2-1", "(x-1)*(x+1)"))
```

## 五、与其他对比

相比 GSM8K，MATH 更难、答案非纯数值、需符号判等；相比 MiniF2F（形式化证明），MATH 用自然推理不需证明助手。MATH 更适合测高阶推理。

## 六、常见误区

误区一：用字符串匹配答案导致漏判等价式。误区二：只看总体分忽略难度分层。误区三：认为高 MATH 即通用数学能力。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：MATH 为何需要符号等价判定？答：答案形式多，需 SymPy 化简判等而非字符串匹配。
- Q：难度分层的作用？答：定位模型在何种难度开始失效。

## 九、演进

MATH 推动过程监督（PRM）研究，Lightman 2023 的 MATH 步骤标注成为过程奖励模型标准数据集。

## 十、小结

MATH 以高难度与细粒度难度分层，成为检验高阶数学推理与过程监督的关键基准。
