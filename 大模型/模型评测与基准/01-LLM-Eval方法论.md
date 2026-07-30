# 模型评测与基准 · 01 LLM Eval 方法论

## 一、为什么 LLM 评测如此之难

传统 ML 评测简单：分类看 Accuracy、回归看 MSE、推荐看 AUC。LLM 不行，因为三个结构性困难（Copy et al. 综述归纳）：

| 困境 | 说明 |
|------|------|
| **多维性** | 能力维度 = {知识, 推理, 代码, 数学, 创意, 安全, 指令遵循, …}，单一指标无法捕捉全貌 |
| **主观性** | 「好回答」本身主观；人类标注员间一致性（Cohen's κ）仅 **≈0.4–0.7** |
| **动态性** | 模型频繁更新、基准公开后被训进数据（污染）、易过拟合 → Goodhart 定律 |

> Goodhart 定律：「当一个指标成为目标，它就不再是好指标」。模型可能针对基准优化而非真提升能力。

## 二、三大评测方法

### 2.1 静态基准（Static Benchmarks）

标准化题集，不同模型同条件比较。优点是可量化、可复现、快速筛选；缺点是易数据污染、易 gaming、单分数片面。

代表（详见 02 篇）：MMLU、GSM8K、HumanEval、GPQA、SWE-bench、LiveBench、Hella's Last Exam。

### 2.2 人类偏好评估（Human Preference）

以人类真实偏好为核心。最可信但最贵、难规模化。代表：**LMSYS Chatbot Arena**——匿名 pairwise 对比、累积投票聚成 Elo 排名（截至 2026-01 约 **499 万票 / 296 模型**）。

局限：用户群体偏差、成本/可扩展性、品牌盲测仍可能受隐式偏见影响。

### 2.3 LLM-as-Judge（模型评模型）

用 LLM 按自定义标准给另一 LLM 的输出打分。**GPT-4 级 judge 与人类标注员一致性 >80%**，成本仅为人类的 **500–5000×**，是企业最实用的自动化方案。

```mermaid
flowchart LR
    P[原始 prompt] --> S[LLM 系统输出]
    S --> J[LLM Judge + 评分 rubric]
    J --> SC[分数 0-1 / 胜者]
    SC --> DASH[看板 / 回归]
```

## 三、LLM-as-Judge 深入

### 3.1 两种类型

| 类型 | 输出 | 适用 |
|------|------|------|
| **Single-output** | 对单条输出打定量分（可 referenceless 或 reference-based） | 答案相关性、忠实度、正确性打分 |
| **Pairwise** | 从多条输出里选「赢家」（不输出分） | 类 Arena 的 A/B 对比 |

### 3.2 G-Eval：最常用自定义 Judge

G-Eval 思路：用 LLM 定义**评估标准（rubric）+ CoT 自评**，输出 0–1 分数。常见指标：
- **Answer Relevancy**（回答是否切题）
- **Faithfulness**（是否忠实事实、不幻觉）
- **Correctness / Helpfulness / Bias**

```python
# 伪代码：用 DeepEval 实现 single-output judge（G-Eval）
from deepeval import evaluate
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase

metric = GEval(
    name=" coherence ",
    criteria="评判摘要对原文是否连贯",   # 评估 rubric
    evaluation_params=["input", "actual_output"],
)
test_case = LLMTestCase(input=article, actual_output=summary)
evaluate([test_case], [metric])
```

### 3.3 提升 Judge 可靠性的技巧

- **CoT 提示**：让 judge 先写评判理由再打分，减少随意性。
- **In-context learning**：给 1–2 个打分示例校准尺度。
- **Swap position（pairwise 必做）**：两条输出左右互换各评一次，消除**位置偏差**（固定放左边易赢）。
- **独立更强 judge**：别用被测同模型当 judge（自我偏好偏差）。
- **人类校准**：上线前用一批人类标注对齐，目标 >80% 一致。

### 3.4 常见偏差与破解

| 偏差 | 表现 | 破解 |
|------|------|------|
| 位置偏差 | pairwise 固定左赢 | 换位置各评一次 |
| 自我偏好 | 偏好同家族模型 | 用独立 judge |
| 长度偏差 | 越长越被当好 | rubric 强调质量非长度 |
| 权威偏差 | 自信表述被当对 | 要求引用/验证 |

## 四、自动化 Eval 流水线

生产级评测应做成**可重复流水线**，而非一次性跑分：

```
任务测试集(私有/领域) → 批量跑 LLM 系统 → Judge 打分(LLM-as-Judge) 
   → 指标聚合(准确率/忠实度/相关性) → 看板/回归对比 → 告警/人工抽审
```

关键组件：
- **数据集版本化**：任务特异 cases + 领域基准 + 私有题（防污染）。
- **持续评测**（OpenAI Evals 哲学）：开发全程记录好 case，尽量自动化，用人类反馈校准。
- **可复现**：用 lm-eval-harness 等标准实现跨模型一致比较。
- **回归门禁**：每次提示词/RAG/Agent 改动跑 eval 前后对比，掉点即拦。

> 对 RAG / Agent 尤其重要：真实任务失败率可达 60–90%，**没 eval 就上线等于盲飞**。RAG 用 RAGAS 四指标（faithfulness / answer_relevancy / context_precision / context_recall）当回归看板。

## 五、生产三层防线

```
第一层：任务特异测试集（你的真实分布，私有/动态题）
第二层：领域基准（GPQA / SWE-bench / 行业题）
第三层：线上 A/B + 人类抽检（关键路径必加）
```

- 静态基准给广度基线，领域基准给区分度，人类/A-B 兜底高风险。
- 动态/私有题防 gaming（基准公开易被训进数据）。

## 六、小结

- 评测难在多维、主观、动态；需多方法组合。
- LLM-as-Judge 是当前生产主流（单/双两型 + G-Eval），但必须人类校准、防偏差。
- 把评测做成自动化流水线 + 回归看板，RAG/Agent 改动必跑。
- 三层防线（私有集 / 领域基准 / 线上 A-B）覆盖广度与高风险。

> 下一篇（02）盘点主流基准与榜单，讲清楚每个测什么、哪些已饱和、怎么按任务选型。
