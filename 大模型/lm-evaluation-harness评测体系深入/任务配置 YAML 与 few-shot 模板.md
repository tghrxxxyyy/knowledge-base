# 任务配置 YAML 与 few-shot 模板

> 对应 Gao et al. 2021 lm-evaluation-harness（EleutherAI）任务配置与模板机制；参考官方仓库 YAML 规范。

## 一、背景与挑战

评测分数对提示格式极度敏感：few-shot 示例的措辞、分隔符、选项顺序、是否带 CoT，都会显著改变模型表现（文献中「prompt sensitivity」问题）。若把模板硬编码进 Python，则难以评审、共享与审计，且跨版本不一致会使历史分数失去可比性。harness 的设计哲学是把「数据与模板作为配置而非代码」：用 YAML 声明数据集、few-shot 数量、文档到文本的渲染模板，使评测契约可版本化、可复审。

挑战在于：模板语言需兼顾灵活（不同任务不同结构）与可控（避免随意改动导致不可复现），并要在长上下文下处理示例截断。

## 二、核心原理

任务 YAML 通常声明：

1. `dataset` / `dataset_path`：HuggingFace 数据集名或本地路径与配置、拆分。
2. `num_fewshot`：few-shot 示例数量，影响分数且必须固定以保证可比。
3. `doc_to_text` / `doc_to_target`：将样本字段渲染为模型输入与期望输出的模板。
4. `template` / `question_template`：控制提示外壳（如「问题：{q}\n答案：」）。
5. `metric_list`：指定计分函数与聚合。

运行时 harness 将 $k$ 个训练/校验样本渲染为示范，与测试样本拼接，构成完整 prompt 送入模型。

## 三、形式化与数学基础（含 LaTeX）

few-shot 提示构造为示范拼接：设第 $j$ 个示范为文档 $d_j$ 与其答案 $a_j$ 的渲染，测试问题为 $q$，则输入：

$$
x = q_{\text{header}}\oplus \sum_{j=1}^{k}\big(\phi(d_j)\oplus a_j\big)\oplus \phi(q_{\text{test}})
$$

其中 $\phi(\cdot)$ 为模板渲染函数。对多选任务，常对候选 $c_m$ 分别构造并计算似然：

$$
P(c_m\mid x)=\exp\big(\log P(x\oplus c_m)-\log P(x)\big)
$$

模板任何改动（分隔符、顺序）都会改变 $x$，从而改变分数——这正是模板须版本化的原因。

## 四、代码实现

```python
# 模板渲染为完整 prompt（结构示意）
def build_prompt(docs, k, q, template):
    parts = [template["header"]]
    for d in docs[:k]:
        # 拼接 k 个示范（文档+答案）
        parts.append(template["shot"].format(q=d["question"], a=d["answer"]))
    parts.append(template["test"].format(q=q))
    return "\n".join(parts)
```

```yaml
# 任务 YAML 片段（示意）
task: my_qa
dataset_path: my_dataset
num_fewshot: 5
doc_to_text: "问题：{{question}}\n答案："
metric_list:
  - metric: acc
```

## 五、与其他技术对比

- 硬编码模板：灵活但不可审计、易漂移，不利复现。
- YAML 配置：可评审、可共享、可版本化，降低「提示泄露」风险（明确契约）。
- 与提示工程（dair-ai）关系：评测模板是「固定契约」，提示工程是「寻求最优」，二者目标不同但都强调模板重要性。

## 六、常见误区

- 「未冻结模板导致跨版本分数不可比」：模板改动即新实验，旧分数应归档。
- 「上下文过长截断示范」：num_fewshot 过大超出上下文会截断，需按模型窗口校准。
- 「示例来自测试拆分」：造成数据泄露，few-shot 必须来自训练/校验。
- 「只改措辞不报变更」：任何模板变化都应记录在实验指纹中。

## 七、与开源书·权威来源对应

- Gao et al. 2021：harness 以 YAML 描述任务与模板，支撑可复现评测。
- 官方仓库 `lm_eval/tasks/*/*.yaml`：真实配置样例（以最新版为准）。
- dair-ai Prompt Engineering Guide：提示敏感性背景。

## 八、面试题

- 为何 few-shot 数量要写进配置并版本化？改了会怎样？
- 模板哪一处的改动最可能改变分数？如何隔离「模板效应」与「模型效应」？
- few-shot 示例来源为何不能取自测试集？

## 九、演进与趋势

模板库与提示审计成为评测合规要求；声明式任务让非工程师也能贡献；模板版本与分数一同归档进「结果复现与版本固化」的实验指纹，形成可审计的评测链路。

建议把模板纳入代码评审流程：任何 few-shot 措辞或分隔符改动都需 review，因为其影响往往隐蔽却显著。模板即评测契约，应像对待代码一样对待它的版本与变更。

## 十、小结

任务配置 YAML 把数据集、few-shot 数量与模板渲染声明为可版本化契约，使评测分数对提示格式的变化可审计、可复现。其权威基础是 Gao 2021 与 harness 官方规范，落地关键是冻结模板、隔离示例来源、并将模板版本与分数一并归档。
