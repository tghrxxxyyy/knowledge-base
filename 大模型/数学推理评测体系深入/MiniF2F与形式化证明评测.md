# MiniF2F与形式化证明评测

> 对应 Zheng et al. 2022 "MiniF2F: a cross-system benchmark for formal Olympiad-level mathematics"。

## 一、背景与挑战

自然语言数学解答无法机器校验正确性。MiniF2F 用 Lean 等证明助手把竞赛题转为形式化命题，使"证明是否正确"可确定性验证，但门槛高、题量少。

## 二、核心原理

每题含形式化陈述与目标，模型生成 proof 脚本由 Lean 编译判定。评测指标为证明通过率，并可测 best-of-n 与树搜索（如 draft-sketch-prove）成功率。

## 三、数学形式

证明通过率：

$$
\mathrm{Pass}=\frac{1}{N}\sum_{i=1}^{N}\mathbf{1}[\text{Lean accepts } \pi_i]
$$

树搜索成功：

$$
P_{\mathrm{tree}}=1-\prod_{j=1}^{B}(1-p_j)
$$

## 四、代码实现

```python
def tree_success(probs):
    fail = 1.0
    for p in probs:
        fail *= (1 - p)
    return 1 - fail

print(round(tree_success([0.2,0.2,0.2,0.2,0.2]), 4))
```

## 五、与其他对比

相较 MATH（自然推理），MiniF2F 正确性可机器判定但题量小；相较 GSM8K，它测证明而非计算。

## 六、常见误区

误区一：形式化通过即人类可理解。误区二：题量少代表泛化强。误区三：忽略证明助手版本差异。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：MiniF2F 的核心价值？答：用证明助手确定性验证数学证明正确性。
- Q：best-of-n 对证明的意义？答：多次采样取首个被 Lean 接受的证明。

## 九、演进

从人工证明到 draft-sketch-prove 与形式化搜索，MiniF2F 推动 AI 数学证明进入可验证时代。

## 十、小结

MiniF2F 以形式化确定性校验补自然语言的不可验证短板，是高端数学评测的严谨锚点。
