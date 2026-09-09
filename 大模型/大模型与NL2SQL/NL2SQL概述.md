# NL2SQL 概述（大模型视角）

> 对应 text-to-SQL 研究与用户 NL-to-SQL 智能问数工作；综述参考 Yu et al. 2018 (Spider)、大模型方法 DIN-SQL (Pourreza & Rafiei 2023)、C3-SQL。

## 一、背景与挑战

业务用户希望用自然语言直接问数据：「上月华东区销售额多少」「生效订单里复购用户占比」。这要求系统把自然语言精准转为可执行 SQL。难点集中在：多表 JOIN、嵌套子查询、相对时间（最近几天/上月/去年）、领域术语/同义词、字典与关联表、权限与安全、以及多轮追问的上下文继承。

与传统 BI 相比，NL2SQL 降低了使用门槛，但把「自然语言歧义」与「SQL 严格语义」之间的矛盾暴露出来，任何理解偏差都会产生错误结果而非报错。

## 二、核心原理

主流链路为「检索增强生成（RAG）+ 自校验」：

1. 自然语言理解：解析意图、实体、约束。
2. Schema 检索：从多表库中召回与问题相关的表/字段（见 Schema 检索章节）。
3. SQL 生成：把问题 + 精简 schema + 业务映射 + 示例拼成 prompt，由 LLM 生成 SQL。
4. 执行校验：在影子库执行，捕获报错并自修复（见执行校验章节）。
5. 结果返回与后处理：脱敏、格式化。

关键在于「给模型的上下文既要充分又要精简」——过多噪声降低准确率，过少则信息不足。

## 三、形式化与数学基础

把问题 $q$ 与数据库 schema $S$ 映射为 SQL 预测：

$$\hat y = \arg\max_{y\in\mathcal{Y}} P_{\theta}(y \mid q, \mathcal{R}(S, q))$$

其中 $\mathcal{R}(S,q)$ 为检索出的相关 schema 子集，$\mathcal{Y}$ 为合法 SQL 空间。目标最大化执行准确率：

$$\max_{\theta} \mathbb{E}_{(q,S,y^*)\sim\mathcal{D}}\big[\mathbb{1}[\text{exec}(\hat y)=\text{exec}(y^*)]\big]$$

自校验可视为对 $\hat y$ 的拒绝/重采样循环，直到 $\text{exec}$ 成功或步数耗尽。

## 四、代码实现

最小可用流程（示意）：

```python
schema = retrieve_relevant_schema(question, db)   # 向量检索
prompt = build_prompt(question, schema, mappings) # 注入映射
sql = llm.generate(prompt)
ok, err = safe_execute(sql, shadow_db)            # 只读影子库
if not ok:
    sql = llm.generate(prompt + f"报错:{err}，请修正")  # 自修复
return format(execute(sql, shadow_db))
```

## 五、与其他技术对比

| 路线 | 代表 | 特点 |
|------|------|------|
| 规则/模板 | 早期 | 可解释但覆盖低 |
| 微调 seq2seq | PICARD/BRIDGE | 需标注，泛化有限 |
| LLM + 上下文学习 | 当前主流 | 少样本即可，强泛化 |
| LLM + 自校验/分解 | DIN-SQL | 多步分解，准确率高 |
| Text2SQL Agent | 工具调用 | 可交互修正 |

## 六、常见误区

- 直接把整库 schema 塞进 prompt：超长且噪声大，准确率反降。
- 忽略执行报错：生成 SQL 不可运行就返回给用户。
- 把字典/外键关系遗漏，导致错误 JOIN 或枚举。
- 不做权限隔离，用户可能越权查询。
- 用单一准确率指标，不区分「检索失败」与「生成失败」。

## 七、与开源书·权威来源对应

- Spider（Yu et al. 2018）是跨领域 Text-to-SQL 奠基数据集；DIN-SQL、C3-SQL 为大模型时代代表方法。
- 本知识库「大模型与 NL2SQL」整节：相对时间转 SQL、字典表映射、Schema 检索、执行校验、多轮问数、权限与安全。

## 八、面试题

- 为何 NL2SQL 必须给模型 schema 上下文？给全库会有什么问题？
- LLM 时代相比微调 seq2seq 方法优势在哪？
- 自校验循环如何提升准确率？
- 多轮追问如何继承上下文？如何区分检索失败与生成失败？

## 九、演进与趋势

从规则→微调→「LLM + RAG + 自校验」；进一步走向：多步分解（先定表再填条件）、数据库内容感知（BIRD）、与 Agent/工具调用结合的可交互修正、以及面向真实数仓的复杂分析 SQL（Spider 2.0）。评测也从单轮 EX 走向多轮、效率与错误分类报告。

## 十、小结

NL2SQL 是大模型落地数据分析的核心场景。其成败关键在于 schema 检索的精准度、业务映射的完整性、执行校验的可靠性，以及权限安全的兜底。本知识库各专项文档共同构成完整方法论。
