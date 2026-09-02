# 相对时间转 SQL（最近几天/上个月/去年）

> 用户 NL-to-SQL 工作的专项难点。

## 一、背景与挑战

「最近三天」「上个月」「去年同期」需精准翻译为 SQL 时间区间，且需考虑时区与业务口径。

## 二、核心原理

用代码/函数预计算时间边界注入 prompt 或生成：

```sql
-- 最近3天
WHERE create_time >= date_sub(curdate(), interval 3 day)
-- 上个月
WHERE create_time >= date_format(curdate() - interval 1 month, '%Y-%m-01')
  AND create_time <  date_format(curdate(), '%Y-%m-01')
```

## 三、关键要点

- 用 `CURDATE()/NOW()` 动态计算，避免硬编码。
- 月/季/年边界用 `date_trunc` 或 `date_format` 对齐。

## 四、常见误区

- 用 `between '2026-01-01' and '2026-01-31'` 硬编码(过期)。
- 忽略时区导致边界错位。

## 五、面试题

- 为何相对时间必须用动态函数而非固定日期？

## 六、小结

相对时间是 NL2SQL 准确率的关键瓶颈，需代码辅助生成或后处理修正。
