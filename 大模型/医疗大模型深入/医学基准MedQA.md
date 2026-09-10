# 医学基准 MedQA

> 对应 Jin et al. 2021「MedQA: A Large-scale Multi-choice Question Bank for Medical Licensing Exams」、PubMedQA 与 llm-course mlabonne。

## 一、背景与挑战

衡量医学语言模型能力需要「专业考试级」基准，而非通用常识题。MedQA 源自美国医师执照考试（USMLE）风格的多选题，覆盖内科、外科、儿科等多学科，是评测模型临床知识广度与推理能力的权威门槛。挑战在于：基准高分并不直接等价于临床可用；题目常含干扰项与隐含前提；且医学知识随时间（指南更新）演化，基准存在时效偏差。

## 二、核心原理

MedQA 提供四选一/五选一题目，模型需从干扰项中选正确诊断或处理。评测方式包括零样本、少样本（few-shot）与思维链（CoT）推理。除 MedQA 外，常见医学基准还有：PubMedQA（基于 PubMed 摘要的是/否/ perhaps 问答，考察文献理解）、MMLU 的医学子集（临床知识、解剖、生物等）、以及 MedMCQA（印度医学入学考试风格，题量更大）。这些基准从不同维度刻画模型医学能力。

## 三、形式化与数学基础

多选题评测以准确率为主。设测试集 $D=\{(q_i, A_i, y_i)\}$，其中 $A_i$ 为选项集合、 $y_i$ 为正确下标，模型预测 $\hat{y}_i = \arg\max_{j} P_\theta(a_j \mid q_i, A_i)$。准确率：

$$
\text{Acc} = \frac{1}{|D|}\sum_{i=1}^{|D|} \mathbb{1}[\hat{y}_i = y_i]
$$

少样本下模型在上下文中看到 $k$ 个样例，条件变为 $P_\theta(a_j \mid \text{demo}_k, q_i, A_i)$。CoT 进一步引入推理链 $r$ 提升困难题表现： $\hat{y}_i = \arg\max_j P_\theta(a_j \mid q_i, A_i, r)$。

## 四、代码实现

```python
from datasets import load_dataset

medqa = load_dataset("bigbio/medqa", "medqa_en", split="test")

def evaluate(model, dataset, few_shot=True):
    correct = 0
    for item in dataset:
        prompt = build_mc_prompt(item, few_shot)
        pred = model.choose(prompt, item["options"])
        correct += int(pred == item["answer_idx"])
    return correct / len(dataset)

score = evaluate(llm, medqa, few_shot=True)
print(f"MedQA accuracy: {score:.3f}")
```

## 五、与其他技术对比

| 基准 | 类型 | 焦点 | 难度 |
|------|------|------|------|
| MedQA | 多选 | USMLE 临床 | 高 |
| PubMedQA | 问答 | 文献理解 | 中高 |
| MMLU-医 | 多选 | 通识医学 | 中 |
| MedMCQA | 多选 | 医学入学 | 中高 |

MedQA 最贴近「执业考试」，MMLU 更偏通识，PubMedQA 偏文献。

## 六、常见误区

- 误区一：过考试=会看病。基准测知识与推理，不测真实诊疗中的不确定性与责任。
- 误区二：高分即可部署临床。缺乏真实病历、多模态与实时指南对齐。
- 误区三：基准一成不变。医学知识更新快，旧基准可能过时。
- 误区四：只看总分。应按学科细分，识别模型短板。

## 七、与开源书·权威来源对应

- Jin et al. 2021「MedQA」：https://arxiv.org/abs/2009.13081 ；数据集 https://github.com/jind11/MedQA
- PubMedQA：https://arxiv.org/abs/1909.06146
- MedMCQA：https://arxiv.org/abs/2203.14371
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- MedQA 与临床可用性的差距体现在哪些方面？
- 为什么 few-shot / CoT 能提升医学多选题表现？
- PubMedQA 与 MedQA 考察的能力有何不同？
- 医学基准存在哪些时效性与偏差问题？

## 九、演进与趋势

从选择题走向真实病历推理（如 MedQA 扩展、多跳 QA）、多模态临床（影像+文本）、以及动态更新基准。趋势是「过程评测」（不只看答案，看推理步骤）与「循证对齐」评测（是否引用正确指南）。

使用基准的工程要点：按学科细分准确率定位短板，而非只看总分；评测应设置拒答/不确定选项，区分不会与答错，更贴近临床谨慎性；思维链与检索增强提升困难题但也可能放大幻觉，需配合事实校验。建议以 MedQA + PubMedQA + 真实脱敏病历构成三维评估，避免单基准过拟合，并随指南定期更新。

- 学科细分：定位模型具体短板学科。
- 拒答评测：区分不会与答错两种失败。
- 三维评估：考试 + 文献 + 真实病历。
- 时效管理：基准随指南定期刷新。
- 过程评测：不只看答案也看推理链。

## 十、小结

MedQA 是评测医学大模型专业知识的权威门槛，但高分仅代表考试级知识而非临床可用性。应结合 PubMedQA、真实病历与循证 RAG 多维度评估，并关注知识时效与过程正确性。
