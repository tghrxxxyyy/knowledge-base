# 提示 A/B 测试

> 对应在线实验（在线评测指标）；模型评测指标深入 衔接。

## 一、背景与挑战

新提示是否更优需在线证据，而非主观判断。

## 二、核心原理

流量分桶对新旧提示随机分配，比较业务指标（准确率、满意度、成本）；统计显著后全量。

## 三、数学形式

指标差 $\Delta = \bar y_B - \bar y_A$；用两样本 t 检验判显著：$t=\frac{\Delta}{SE(\Delta)}$。

## 四、代码实现

```python
bucket = hash(user_id) % 100
prompt = new_p if bucket < 50 else old_p
```

## 五、与其他对比

- 与 系统提示评估（离线）互补为在线验证。
- 与 提示版本深入 总览衔接。

## 六、常见误区

- 样本不足即全量，方差大误判。
- 未隔离其他变量（同批改了模型）。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- A/B 为何要随机分桶？答：消除选择偏差，使两组可比、差异归因到提示。

## 九、演进

全量切换 → 小流量灰度 → 多臂 Bandit 选优。

## 十、小结

提示 A/B 以随机实验量化优劣，是发布决策依据。
