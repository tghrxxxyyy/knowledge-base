# 无参考评估与 LLM-as-judge

> 对应 Zheng et al. 2023《Judging LLM-as-a-Judge with MT-Bench》与 Es et al. 2023《RAGAS》。

## 一、背景与挑战
人工标注昂贵且慢，有参考指标（如 Exact Match）不适配开放式生成。LLM-as-judge 用强模型当评判者，实现可扩展的无参考评估。

## 二、核心原理
把待评样本与评分标准写成提示，让评判 LLM 输出分数或偏好。为降偏差可采用参考解答、多评委投票、链式理由（先给依据再打分）。RAGAS 的多个维度即建立在 judge 之上。

## 三、形式化与数学基础
评判可建模为偏好概率：
$P(y_1 \succ y_2 \mid x) = \sigma(r_\phi(x,y_1) - r_\phi(x,y_2))$
其中 $r_\phi$ 为评判模型给出的标量分数，与 Bradley-Terry 偏好模型一致。

## 四、代码实现
```python
def llm_judge(llm, rubric, sample):
    prompt = f"按标准评分(1-5)并先说明理由：\n{rubric}\n样本：{sample}"
    return llm.complete(prompt)
```

## 五、与其他技术对比
相比人工评测，LLM judge 快且便宜；相比规则指标，更懂语义。缺点有位置偏差、奉承偏差，需要校准与多评委。

## 六、常见误区
误区一：评判 LLM 永远客观，实则存在系统性偏差。误区二：单评委单次打分，方差大不稳定。

## 七、与开源书/权威来源对应
- Zheng et al. 2023 系统分析 LLM judge 的能力与偏差。
- Es et al. 2023 将 judge 用于 RAG 维度。
- run-llama/llama_index 集成 judge 评测。

## 八、面试题
1. LLM-as-judge 有哪些已知偏差？如何缓解？
2. 为何要「先理由后打分」？
3. 如何验证 judge 与人工一致性？

## 九、演进与趋势
训练专用评判模型（reward model）替代通用 LLM，结合 human preference 数据提升一致性；并做评委间一致性校验。

## 十、小结
LLM-as-judge 是规模化无参考评估的关键，但需谨慎校准偏差。
