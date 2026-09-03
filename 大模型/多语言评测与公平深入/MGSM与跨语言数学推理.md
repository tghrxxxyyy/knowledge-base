# MGSM与跨语言数学推理

> 对应 Shi et al. 2022 "Language Models are Multilingual Chain-of-Thought Reasoners" (MGSM)。

## 一、背景与挑战

GSM8K 仅英语，难以判断非英语数学推理是否同等。MGSM 将其翻译为 10+ 种语言，检验多语 CoT。挑战是翻译是否保真、非拉丁脚本是否影响推理。

## 二、核心原理

MGSM 每题含多语言版本，评测各语言 pass@k 与跨语言一致性。常用 "translate-test"（英解题再译）对比 "native"（原生多语）以分离翻译效应。

## 三、数学形式

跨语言一致率：

$$
C=\frac{1}{L}\sum_{l}\mathbf{1}[y_l=y_{\mathrm{en}}]
$$

多语平均：

$$
\bar{A}=\frac{1}{L}\sum_{l}\mathrm{Acc}_l
$$

## 四、代码实现

```python
def cross_lingual(answers, ref):
    return sum(1 for a in answers if a == ref) / len(answers)

print(cross_lingual(["42","36","42","42"], "42"))
```

## 五、与其他对比

相比 GSM8K（单语），MGSM 多语；相比 XOR-TyDi（理解），MGSM 测推理。translate-test 揭示英语优势。

## 六、常见误区

误区一：多语分低即推理差（可能语言障碍）。误区二：翻译无损假设。误区三：忽略脚本对 token 化的影响。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：MGSM 解决什么？答：把 GSM8K 扩展多语测跨语言数学推理。
- Q：translate-test 用途？答：分离英语推理优势与翻译效应。

## 九、演进

从 MGSM 到多语 CoT 与跨语言对齐训练，非英语推理成为重点改进方向。

## 十、小结

MGSM 以多语平行数学题量化跨语言推理落差，是公平评测关键基准。
