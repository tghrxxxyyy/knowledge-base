# 数据分析与 BI

> 对应 Text-to-SQL（Spider 基准，Yu et al. 2018）、NL-to-SQL 技术、HuggingFace Transformers 文档。

## 一、背景与挑战

企业数据分析长期受困于"会 SQL 的人少、要报表的人多"。Text-to-SQL 让业务人员用自然语言直接取数、出图、答疑。挑战：其一，**schema 理解**，模型需掌握数十张表、上百字段与复杂外键；其二，**多表 join 与聚合**，业务问题常跨事实表与维度表；其三，**权限与安全**，生成 SQL 不得越权访问敏感表；其四，**可执行正确性**，SQL 语法对、语义错比报错更危险；其五，**歧义消歧**，同词多义（"用户"指注册用户还是活跃用户）需结合上下文；其六**成本与延迟**，每次自然语言都生成并执行 SQL，需控制调用频率与查询范围；其七**结果可信**，自动出图需防误导（轴截断、把相关性当因果）。

## 二、核心原理

对话式分析典型管线：

1. **Schema 检索**：把数据库表结构（DDL、字段注释、样例值）召回进 prompt，作为"上下文字典"。
2. **NL→SQL 生成**：模型把自然语言转成带正确 join/where 的 SQL。
3. **执行校验**：在影子库/只读副本执行，捕获语法与运行错误并回灌重写。
4. **结果解读**：对返回表做聚合、异常解读与自然语言总结，必要时自动绘图。
5. **权限拦截**：在生成或执行前用策略引擎过滤敏感表/列，杜绝越权查询。

## 三、形式化与数学基础

Text-to-SQL 视为条件生成：给定自然语言问句 $q$ 与数据库 schema $S$，输出 SQL 程序 $y$：

$$P(y\mid q, S) = \prod_{t} P(y_t \mid y_{<t}, q, S)$$

执行正确率常用 **Execution Accuracy**（跑出结果集一致）衡量，比单纯的字符串匹配更贴近真实可用性。权限侧可建模为约束满足：生成的 $y$ 须满足策略谓词 $\phi(y)=\text{true}$（如不含 `salary` 表、限于 `WHERE region=当前`）。多轮对话还需维护槽位状态 $b(s)$。

## 四、代码实现

一个带 schema 上下文与执行校验的最小实现：

```python
from sqlalchemy import text, SQLAlchemyError

def nl_to_sql(question: str, schema_ddl: str, engine) -> str:
    prompt = (f"数据库结构：\n{schema_ddl}\n"
              f"只用上述表，生成一条 SQL 回答：{question}\n只输出 SQL。")
    sql = llm(prompt).strip().strip("`")
    try:
        with engine.connect() as c:
            c.execute(text(sql))                 # 只读校验
    except SQLAlchemyError as e:
        sql = llm(f"SQL 报错：{e}\n原问题：{question}\n修正 SQL：")
    return sql

def enforce_policy(sql: str, allowed_tables: set) -> bool:
    return all(t in allowed_tables for t in extract_tables(sql))
```

## 五、与其他技术对比

| 维度 | 固定报表 | 自助 BI 拖拽 | Text-to-SQL |
|------|----------|--------------|-------------|
| 门槛 | 高(开发) | 中 | 低(自然语言) |
| 灵活度 | 低 | 中 | 高 |
| 正确性风险 | 低 | 中 | 需校验 |

## 六、常见误区

- **不给 schema 就生成 SQL**：模型凭空造表名/字段，必然出错。
- **跳过执行校验**：语义错误（错 join）静默返回错误数。
- **忽略权限**：让模型能查全库，泄露薪资等敏感列。
- **歧义不消**：同一"销售额"口径未对齐导致数不对。
- **无限范围查询**：无 LIMIT 致全表扫描拖垮数仓。
- **把相关当因果**：自动解读里混淆相关性与因果，误导决策。

## 七、与开源书·权威来源对应

- Yu et al. 2018, *Spider*（跨库 Text-to-SQL 基准）。
- Rajkumar et al., *Evaluating NL-to-SQL（多表 join 难度）*。
- 真实库基准：BIRD（含噪声真实数据库）。
- HuggingFace Transformers（序列生成）；LangChain SQL Agent、LlamaIndex SQL。

## 八、面试题

1. 为何 Text-to-SQL 必须提供 schema 上下文？
2. Execution Accuracy 相比精确匹配有何优势？
3. 如何防止生成的 SQL 越权访问敏感数据？
4. 多表 join 场景下模型最容易犯什么错？
5. 多轮对话中如何维护查询的槽位状态？

## 九、演进与趋势

从"单轮 SQL"走向"多轮对话分析"（追问下钻、自动选图）；向量库 + 指标语义层（metrics layer）统一口径；本地小模型在私有数仓内闭环保障数据不出域；自动异常检测与归因成为 BI 标配；text-to-Python（pandas/plotly）补充 text-to-SQL 的灵活分析，覆盖非结构化探索。

## 十、小结

Text-to-SQL 的成败在"上下文给准、执行验真、权限守牢"。schema 检索与执行校验是两条生命线，指标语义层统一口径、结果解读警惕因果误用，把自然语言变成可信赖的业务洞察才是 BI 智能化的终点。
