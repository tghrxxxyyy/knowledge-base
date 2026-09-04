# Lion的cosine权重衰减耦合

> 对应 Chen 2023 Lion (arXiv:2302.06675)。

## 一、背景与挑战
Lion 常配合 cosine 学习率衰减；权重衰减是否也该随训练衰减，是实践中的开放问题。

## 二、核心原理
由于 Lion 步长恒定，若 λ 固定，后期参数收缩率 `ηλ` 随 η 下降而自然减小。部分工作探索把 λ 也做 cosine 调度，使收缩更平滑。

## 三、形式化与数学基础
标准：`η(t) = η_min + 0.5(η_max-η_min)(1+cos(πt/T))`。可令 `λ(t) = λ·η(t)/η_max`，保持 `(ηλ)(t)` 同步衰减。

## 四、代码实现
```python
import math
def cosine_lr_wd(t, T, lr_max, wd_max):
    coef = 0.5 * (1 + math.cos(math.pi * t / T))
    lr = lr_max * coef
    wd = wd_max * coef          # 同步衰减
    return lr, wd
```

## 五、与其他技术对比
AdamW 同样适用该耦合；Lion 因步长恒定，λ 调度影响更线性、更易预测。

## 六、常见误区
衰减 λ 到 0 会完全解除正则，末期可能过拟合；应保留最小 λ。

## 七、与开源书/权威来源对应
Chen 2023 Lion 讨论权重衰减与 lr 的协同；d2l-ai/d2l-zh 讲解 cosine 调度。

## 八、面试题
问：Lion 后期为何收缩变弱？答：η 经 cosine 下降，ηλ 随之减小。

## 九、演进与趋势
联合调度 lr 与 wd 正成为大模型训练的标准做法。

## 十、小结
把权重衰减与学习率协同调度，可更精细地控制训练末期的容量。
