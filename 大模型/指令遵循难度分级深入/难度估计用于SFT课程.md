# 难度估计用于SFT课程

> 对应 指令课程微调(SFT Curriculum)与大模型对齐研究。

## 一、背景与挑战

SFT 数据若随机混训，简单样本可能主导梯度，难样本学不充分。用难度估计构造课程(易→难)可提升对齐效率。

## 二、核心原理

先按难度排序指令，训练初期用易样本建立基础遵循能力，后期逐步引入难样本打磨复杂约束遵循。

## 三、数学形式

设难度阈值调度 $\lambda(t)$ 递增，样本权重：

$$
w_i(t) = \sigma\left(\frac{\lambda(t)-D(x_i)}{\tau}\right)
$$

随 $t$ 增大，$\lambda(t)$ 覆盖更高难度区间，等效由易到难。

## 四、代码实现

```python
import torch

def sft_curriculum(diff, lam, tau=1.0):
    return torch.sigmoid((lam - diff) / tau)
```

## 五、与其他对比

相比预训练课程(按困惑度)，SFT 课程按“遵循难度”，目标更偏对齐而非语言建模。

## 六、常见误区

误区：直接对全部 SFT 数据课程化。应先确认难度信号可靠，否则顺序无意义。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Q：SFT 为何用课程？答：由易到难建立遵循能力，难样本学更充分。
- Q：难度信号来源？答：约束计数、AutoIF 可验证度、模型失败率。

## 九、演进

从静态课程到按验证失败率动态调整难样本比例。

## 十、小结

难度估计让 SFT 从“一锅炖”走向“有序教学”，提升数据效率。
