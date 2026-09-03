# HaluEval与幻觉分类

> 对应 Li et al. 2023 "HaluEval: A Large-Scale Hallucination Evaluation Benchmark for Large Language Models"。

## 一、背景与挑战

需大规模、多任务（QA/对话/摘要）幻觉数据。HaluEval 用模型生成幻觉样本 + 人工筛选，构造评测集并测检测能力。

## 二、核心原理

覆盖知识 QA、对话、文本摘要三类，每样本含正常与幻觉回答。评测两任务：模型能否生成不幻觉内容、能否识别幻觉（二分类）。

## 三、数学形式

检测 F1：

$$
F1=2\frac{P\cdot R}{P+R},\quad P=\frac{TP}{TP+FP},R=\frac{TP}{TP+FN}
$$

生成幻觉率：

$$
H=1-\frac{|\mathrm{non-halluc}|}{N}
$$

## 四、代码实现

```python
def f1(tp, fp, fn):
    p = tp/(tp+fp) if tp+fp else 0
    r = tp/(tp+fn) if tp+fn else 0
    return 2*p*r/(p+r) if p+r else 0

print(round(f1(30,5,8),3))
```

## 五、与其他对比

相比 TruthfulQA（真实性），HaluEval 多任务且含检测子任务；相比 FactScore，它不逐条分解。

## 六、常见误区

误区一：能检测即不生成（能力不对称）。误区二：评测集自身含模型生成偏差。误区三：忽略任务差异。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：HaluEval 包含哪些任务？答：QA/对话/摘要的生成与检测。
- Q：检测与生成能力关系？答：二者不等价，需分别评测。

## 九、演进

从单基准到多任务 + 检测评测，幻觉研究兼顾生成质量与识别能力。

## 十、小结

HaluEval 以多任务与检测子任务，提供幻觉生成与识别的双向评测。
