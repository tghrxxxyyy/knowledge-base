# XOR-TyDi与多语理解

> 对应 Clark et al. 2020 "TYDI QA" 与 Asai et al. 2021 "XOR QA" 多语言问答评测。

## 一、背景与挑战

开放域多语 QA 需跨语言检索与生成，低资源语言检索语料稀疏。挑战是评测是否真多语检索而非英语中介。

## 二、核心原理

XOR-TyDi 覆盖 14 种语言，含无答案与跨语言证据。评测用 EM/F1 与检索命中率，强调"先检索再答"的端到端多语能力。

## 三、数学形式

多语 F1：

$$
F1=2\cdot\frac{P\cdot R}{P+R}
$$

检索命中：

$$
H=\mathbf{1}[\text{gold doc in top-}k]
$$

## 四、代码实现

```python
def f1(pred, gold):
    p = set(pred); g = set(gold)
    if not p or not g:
        return 0.0
    return 2*len(p&g)/(len(p)+len(g))

print(round(f1("the cat", "cat the"), 3))
```

## 五、与其他对比

相比 MGSM（推理），XOR-TyDi 测检索式理解；相比 MMLU（选择题），它更近真实开放域。

## 六、常见误区

误区一：英语中介检索公平（低资源吃亏）。误区二：只看生成忽略检索命中。误区三：忽略无答案样本。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：XOR-TyDi 难点？答：跨语言检索 + 低资源 + 无答案样本。
- Q：为何不能直接英语检索？答：会系统性偏袒高资源语言。

## 九、演进

从单语 QA 到多语检索增强，XOR-TyDi 推动跨语言检索与生成评测。

## 十、小结

XOR-TyDi 以端到端多语检索问答检验真实跨语言能力，揭示资源落差。
