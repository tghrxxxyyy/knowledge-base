# 相对时间转 SQL

> 见「大模型与数据库深入/大模型与数据库总览」；用户 NL2SQL 工作流专项难点。

## 一、背景与挑战

「最近几天/去年/上个月/本季度」需转成精确的日期区间，否则 SQL 既错又难调试。

## 二、核心原理

由当前日期 `CURDATE()` 推导：
- 最近 N 天：`create_time >= DATE_SUB(CURDATE(), INTERVAL N DAY)`
- 上个月：`create_time BETWEEN DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01') AND LAST_DAY(CURDATE() - INTERVAL 1 MONTH)`
- 去年：`YEAR(create_time) = YEAR(CURDATE()) - 1`
关键是把模糊相对词映射为确定边界。

## 三、关键要点

- 边界含不含当天需明确。
- 时区/数据库类型（MySQL vs PG）函数不同。

## 四、代码实现

```sql
WHERE create_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
```

## 五、与其他对比

- 绝对日期简单；相对日期需推理。

## 六、常见误区

- 用 `BETWEEN` 含时间边界错——注意时分秒。

## 七、与开源书对应

- llm-universe: https://github.com/datawhalechina/llm-universe
- 用户 Dify 工作流实践。

## 八、面试题

- 如何用 SQL 表达「上个月」？

## 九、演进

硬编码 → 函数推导 → LLM 推理+校验。

## 十、小结

时间是 NL2SQL 的「隐形陷阱」。
