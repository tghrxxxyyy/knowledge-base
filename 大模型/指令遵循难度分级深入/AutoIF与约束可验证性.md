# AutoIF与约束可验证性

> 对应 Cai et al. 2024 "AutoIF: Automating Instruction Following Evaluation via Iterative Framework" 相关工作。

## 一、背景与挑战

指令遵循难以自动评测，因约束常是自然语言、不可执行。AutoIF 思路是把约束转为可验证代码/规则，从而客观打分。

## 二、核心原理

从指令中抽取原子约束，用代码或规则表达，再对模型输出自动检查满足度。可验证性本身也是难度信号：约束越多越难满足。

## 三、数学形式

指令含 $k$ 个约束 $c_1,\dots,c_k$，输出 $y$ 满足度：

$$
S(y) = \frac{1}{k}\sum_{j=1}^{k} \mathbb{1}[\mathrm{check}_{c_j}(y)=\mathrm{True}]
$$

难度随 $k$ 与约束间耦合度上升：

$$
D \propto k + \sum_{i<j} \mathrm{Dep}(c_i,c_j)
$$

## 四、代码实现

```python
def satisfies(output, checks):
    return sum(c(output) for c in checks) / len(checks)

def constraint_count(prompt):
    import re
    return len(re.findall(r'必须|不能|不超过|格式为', prompt))
```

## 五、与其他对比

相比人工评测，AutoIF 可规模化、可复现；相比规则模板，它能从自由指令抽取约束。

## 六、常见误区

误区：约束数=难度。约束间冲突会使难度超线性上升。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide
- AutoIF：https://arxiv.org/abs/2310.02304

## 八、面试题

- Q：AutoIF 怎么做评测？答：抽约束→转可验证检查→自动打分。
- Q：可验证性与难度关系？答：约束越多越耦合越难。

## 九、演进

从人工规则到 LLM 抽取约束并生成检查代码，闭环自动评测。

## 十、小结

可验证约束把“遵循难度”量化，是难度分级的硬指标。
