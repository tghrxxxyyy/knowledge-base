# 忠实性vs事实性对比

> 对应摘要/生成场景忠实性（faithfulness）与事实性（factuality）评测的对照分析。

## 一、背景与挑战

摘要模型可能"忠实但不事实"（贴合原文但原文错）或"事实但不忠实"（补充外部知识）。两类错误需不同评测协议。

## 二、核心原理

忠实性评测比对生成与原文（无中生有即不忠实）；事实性评测比对外部知识。两者正交，应分别报告。

## 三、数学形式

忠实性：

$$
F_c=1-\frac{|\mathrm{extrinsic}(y,\mathrm{src})|}{|\mathrm{claims}|}
$$

事实性：

$$
F_a=\frac{|\mathrm{aligned}(y,\mathcal{K})|}{|\mathrm{claims}|}
$$

## 四、代码实现

```python
def report(faith, fact):
    return {"faithfulness": round(faith,3), "factuality": round(fact,3)}

print(report(0.9, 0.75))
```

## 五、与其他对比

相比单一"正确"，二维揭示不同失败模式；相比 TruthfulQA（仅事实），摘要需同时看忠实。

## 六、常见误区

误区一：忠实即事实（原文错时失真）。误区二：事实即忠实（补充外部知识不忠实）。误区三：混用指标。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：忠实与事实为何正交？答：可忠实但错、事实但补充，需分别测。
- Q：摘要评测该报什么？答：忠实性（对原文）与事实性（对知识）双指标。

## 九、演进

从单一正确性到忠实/事实二分，评测更贴合真实生成失败模式。

## 十、小结

忠实性与事实性正交，分别评测才能定位幻觉的真实来源。
