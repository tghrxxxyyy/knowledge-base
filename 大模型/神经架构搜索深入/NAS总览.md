# 神经架构搜索总览

> 对应 d2l-zh；Zoph & Le, *Neural Architecture Search with RL*, 2017；Elsken et al., *NAS Survey*, 2019。

## 一、背景与挑战

人工设计架构费时，能否自动搜最优结构？

## 二、核心原理

NAS 三要素：**搜索空间**（候选操作/连接）、**搜索策略**（RL/进化/可微）、**性能评估**（训练代理或一次到位）。目标是在约束（精度/延迟/参数量）下找最优子网络。

## 三、关键要点

- 搜索空间决定上限。
- 评估最贵，需加速。

## 四、代码实现

```python
# 概念：搜索循环
arch = search.sample(); acc = evaluate(arch); search.update(acc)
```

## 五、与其他对比

| 环节 | 选项 |
|------|------|
| 策略 | RL/进化/可微 |
| 评估 | 全训/代理 |

## 六、常见误区

- NAS 自动即最优——搜索空间设计仍关键。

## 七、与开源书对应

- Zoph & Le, 2017.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 八、面试题

- NAS 三要素是什么？

## 九、演进

RL-NAS → 进化 → 可微 DARTS → 权重共享。

## 十、小结

让机器，自己画网络。
