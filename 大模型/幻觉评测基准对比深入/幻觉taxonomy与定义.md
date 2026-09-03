# 幻觉taxonomy与定义

> 对应 Huang et al. 2023 "A Survey on Hallucination in Large Language Models" 的幻觉分类。

## 一、背景与挑战

"幻觉"术语混乱：有的指不忠实（与上下文矛盾），有的指不事实（与世违背）。清晰 taxonomy 是评测可比的前提。

## 二、核心原理

主流二分：事实性幻觉（faithfulness to world）与忠实性幻觉（faithfulness to given context）。细分：内在（无依据编造）与外在（与可靠知识冲突）；封闭/开放域。

## 三、数学形式

忠实性：

$$
F=1-\frac{|\mathrm{contradict}(y,c)|}{|y|}
$$

事实性：

$$
T=\frac{|\mathrm{supported}(y,\mathcal{K})|}{|y|}
$$

## 四、代码实现

```python
def faithfulness(claims, supported):
    return supported / len(claims) if claims else 1.0

print(round(faithfulness(10, 8), 3))
```

## 五、与其他对比

相比泛化错误，幻觉特指"流畅但错"；相比推理错，幻觉强调生成与依据脱节。

## 六、常见误区

误区一：把所有错误叫幻觉。误区二：混淆忠实与事实。误区三：忽略任务类型（生成 vs 抽取）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：忠实性与事实性区别？答：前者对给定上下文一致，后者对外部世界真实。
- Q：内在 vs 外在幻觉？答：内在无依据，外在与已知事实冲突。

## 九、演进

从笼统"幻觉"到细粒度 taxonomy，评测基准据此分化（TruthfulQA 测事实，摘要测忠实）。

## 十、小结

清晰 taxonomy 把"幻觉"拆为忠实/事实二维，是评测可比性的基础。
