# 相对时间转 SQL（最近几天/上个月/去年）

> 对应用户 NL-to-SQL 智能问数工作中的专项难点；时间处理思想可参照 SQL 标准（ISO/IEC 9075）与各大数据库日期函数文档。

## 一、背景与挑战

业务用户常以自然语言表达相对时间：「最近三天」「上个月」「去年同期」「本季度至今」。这些表述没有固定日历值，且语义依赖「今天」与业务口径（自然日 vs 交易日、时区、财年起点）。若把时间写死成 `BETWEEN '2026-01-01' AND '2026-01-31'`，文档一旦过期即产生错误结果，且无法跨时区复用。

核心难点：(1) 边界对齐——「上个月」应是 `[上月1日, 本月1日)`，而非简单减 30 天；(2) 粒度——天/周/月/季/年口径不同；(3) 时区——`CURDATE()` 取数据库会话时区，与用户所在地可能不一致；(4) 工作日——「最近三个工作日」需日历表支持。

## 二、核心原理

思路是用数据库内置日期函数动态计算边界，由代码或模型在生成 SQL 时注入，而非写死字面量。典型模式：

- 最近 N 天：`create_time >= CURDATE() - INTERVAL N DAY`
- 本月至今：`create_time >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`
- 上个月：`create_time >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01') AND create_time < DATE_FORMAT(CURDATE(), '%Y-%m-01')`
- 去年同期：用 `DATE_SUB(CURDATE(), INTERVAL 1 YEAR)` 或 `EXTRACT(YEAR FROM ...) - 1`

也可在应用层用 Python 预计算边界 datetime 后参数化注入，避免依赖数据库时区。

## 三、形式化与数学基础

设当前日期为 $t_0$（数据库会话时区），「最近 $k$ 天」区间为：

$$[t_0 - k\cdot\Delta_{day},\ t_0)$$

「上个月」用截断函数 $\text{trunc}(t, \text{month})$ 表示取所在月 1 日零点的映射，则：

$$[\text{trunc}(t_0-\Delta_{month},\text{month}),\ \text{trunc}(t_0,\text{month}))$$

关键点：右端点是开区间，避免把本月 1 日 00:00:00 的记录误计入上月。用 `date_trunc('month', t)`（PostgreSQL）或 `DATE_FORMAT(t,'%Y-%m-01')`（MySQL）实现该 `trunc`。

## 四、代码实现

用 Python 预计算边界并以参数注入（推荐，规避时区与方言差异）：

```python
from datetime import datetime, timedelta
today = datetime.now()
start = (today - timedelta(days=3)).strftime("%Y-%m-%d")
sql = "SELECT * FROM orders WHERE create_time >= %s"
cursor.execute(sql, (start,))   # 参数化，避免注入与时区歧义
```

MySQL 方言直接写：

```sql
-- 最近3天
WHERE create_time >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)
-- 上个月（左闭右开）
WHERE create_time >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
  AND create_time <  DATE_FORMAT(CURDATE(), '%Y-%m-01')
-- 本季度至今（PostgreSQL）
WHERE create_time >= date_trunc('quarter', CURRENT_DATE)
```

## 五、与其他技术对比

| 方式 | 优点 | 缺点 |
|------|------|------|
| 硬编码字面量 | 直观 | 过期即错，不可复用 |
| 数据库函数动态计算 | 自动跟随当前日期 | 依赖 DB 时区/方言 |
| 应用层预计算注入 | 时区可控、方言无关 | 需代码配合 |
| 模型直接生成函数 | 端到端 | 易写错边界/方言 |

生产推荐「应用层或模型生成数据库函数 + 单测校验边界」。

## 六、常见误区

- 用 `BETWEEN '2026-01-01' AND '2026-01-31'` 硬编码，跨月/跨年即失效。
- 把「上个月」写成 `CURDATE() - 30`，遇到 28/31 天月份错位。
- 忽略时区，数据库 `CURDATE()` 取 UTC 而用户在上海，导致边界差一天。
- 用闭区间包含右端点，把下一周期首条记录算进本期。
- 忽略夏令时（DST）导致边界小时级偏差（对按小时统计显著）。

## 七、与开源书·权威来源对应

- 本知识库「大模型与 NL2SQL / NL2SQL 概述」「Schema 检索与上下文」相关章节。
- SQL 标准 ISO/IEC 9075 日期时间函数；MySQL `DATE_SUB`/`DATE_FORMAT`、PostgreSQL `date_trunc` 文档。
- Spider 等评测中时间推理是常见错误类别。

## 八、面试题

- 为何相对时间必须用动态函数而非固定日期？
- 「上个月」的 SQL 为什么右端点要用开区间？
- 如何保证跨时区部署时相对时间计算正确？
- 模型生成 `CURDATE()-30` 有什么隐患？
- 「最近三个工作日」如何用日历表实现？

## 九、演进与趋势

LLM 直接生成时间函数仍易错，趋势是：(1) 用代码/工具预计算边界再注入 prompt（text-to-SQL + tool）；(2) 在 schema 上下文中给出「时间维度表」让模型对齐口径；(3) 后处理校验生成的日期表达式是否含硬编码字面量并自动替换；(4) 引入日历/交易日表处理工作日语义；(5) 把时间边界单测纳入评测驱动开发。

## 十、小结

相对时间是 NL2SQL 准确率的关键瓶颈。正确做法是用数据库日期函数或应用层预计算动态生成时间边界，严格处理开闭区间、时区与夏令时，避免任何写死字面量。
