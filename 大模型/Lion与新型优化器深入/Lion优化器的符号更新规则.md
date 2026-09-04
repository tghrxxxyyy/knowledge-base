# Lion优化器的符号更新规则

> 对应 Chen 2023 Lion (Google Brain, arXiv:2302.06675)。

## 一、背景与挑战
AdamW 需保存一阶、二阶矩两份状态，显存开销大。Lion 通过只保留动量并取符号更新，将优化器状态减半，且在多个大规模任务上媲美甚至超越 AdamW。

## 二、核心原理
Lion 仅维护一个动量 m，更新方向取 `sign(β1·m + (1-β1)·g)` 的符号，再与权重衰减解耦。它不除以二阶矩，本质是带动量的符号SGD。

## 三、形式化与数学基础
$ m_t = \beta_1 m_{t-1} + (1-\beta_1) g_t $

$ \theta_{t+1} = \theta_t - \eta \big( \text{sign}(m_t) + \lambda \theta_t \big) $

其中 `sign` 把每元素映射到 {-1, 0, +1}，更新幅度恒定仅由 η 决定。

## 四、代码实现
```python
def lion_step(p, g, m, lr, beta1, beta2, wd):
    c = beta1 * m + (1.0 - beta1) * g     # 动量更新
    m.copy_(c)
    update = c.sign()                      # 取符号
    p.mul_(1.0 - lr * wd)                  # 解耦衰减
    p.add_(update, alpha=-lr)              # 符号步长
```

## 五、与其他技术对比
相比 AdamW 更新幅度自适应，Lion 步长恒定，对学习率更敏感，但内存省一半，适合超大规模模型。

## 六、常见误区
直接套用 AdamW 的学习率会过大，Lion 通常需要比 AdamW 小 3~10 倍的学习率。

## 七、与开源书/权威来源对应
Chen 2023 Lion (arXiv:2302.06675)；mlabonne/llm-course 将其列为现代优化器代表。

## 八、面试题
问：Lion 为何显存更省？答：只存一阶动量，无二阶矩状态。

## 九、演进与趋势
符号类优化器启发了更多低成本训练方案，与低精度结合前景广阔。

## 十、小结
Lion 以符号更新换取显存与速度，是大模型优化器谱系的重要新成员。
