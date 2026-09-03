# GSM8K基准深度解析

> 对应 Cobbe et al. 2021 "Training Verifiers to Solve Math Word Problems" (GSM8K)。

## 一、背景与挑战

GSM8K 含 8500 道小学水平应用题，需 2-8 步运算。其价值在于答案唯一、步骤可写、规模适中，成为衡量多步算术推理的黄金标准。挑战在于强模型已接近饱和，需警惕训练集污染。

## 二、核心原理

每条样本含自然语言解答（gold rationale）与最终数值答案。评测采用答案精确匹配（数字提取后比较），并常以 self-consistency（多数投票）提升上限。Gold rationale 也可用于训练 verifier。

## 三、数学形式

self-consistency 投票：

$$
\hat{y}=\underset{y}{\mathrm{argmax}}\sum_{i=1}^{k}\mathbf{1}[y_i=y]
$$

验证器对数似然：

$$
P(\text{correct}\mid \tau)=\sigma\big(w^\top \phi(\tau)\big)
$$

## 四、代码实现

```python
from collections import Counter

def majority_vote(answers):
    return Counter(answers).most_common(1)[0][0]

preds = ["42", "42", "36", "42", "39"]
print("vote", majority_vote(preds))
```

## 五、与其他对比

相较 MATH（竞赛级、更难），GSM8K 更易饱和；相较 SVAMP（扰动变体），GSM8K 更标准。GSM8K 适合做训练与消融，MATH 更适合区分顶尖模型。

## 六、常见误区

误区一：答案匹配忽略单位与格式。误区二：把 gold rationale 当唯一正确路径，实际存在多解。误区三：高 GSM8K 分数直接外推到真实数学推理。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：GSM8K 为何用答案精确匹配？答：答案唯一且可程序化校验，降低标注成本。
- Q：self-consistency 为何有效？答：多条独立采样中正确路径更可能多数一致。

## 九、演进

从微调（Cobbe 2021）到 verifier 训练，再到 CoT + 投票，GSM8K 催生了整套推理训练范式，并推动 MATH 等更难题集出现。

## 十、小结

GSM8K 以适中难度与可验证答案成为推理评测基石，但需配合污染检测避免分数虚高。
