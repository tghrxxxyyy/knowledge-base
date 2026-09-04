# SimPO与DPO关系推导

> 对应 Meng 2024 SimPO 与 Rafailov 2023 DPO。

## 一、背景与挑战
SimPO 可视为 DPO 在参考模型取均匀先验下的特例，理解推导有助于调参。

## 二、核心原理
DPO 奖励 $r=\beta\log\frac{\pi_\theta}{\pi_{ref}}$。若把 $\pi_{ref}$ 设为与长度无关的常数基线并做长度归一，即逼近 SimPO 形式。

## 三、形式化与数学基础
DPO 隐式奖励：
$r_{DPO}(x,y)=\beta\log\pi_\theta(y|x)-\beta\log\pi_{ref}(y|x)$
SimPO 令第二项被长度归一常数吸收，得到 $\frac{\beta}{|y|}\log\pi_\theta(y|x)$。

## 四、代码实现
# 二者奖励对照
def dpo_reward(new_lp, ref_lp, beta=0.1):
    return beta * (new_lp - ref_lp)

def simpo_reward(new_lp, length, beta=1.0):
    return beta * new_lp / length

## 五、与其他技术对比
SimPO 是 DPO 的简化无参考变体，代价是丢失对预训练分布的显式 KL 约束。

## 六、常见误区
认为 SimPO 完全无正则——长度归一与目标 margin 充当隐式正则；误用 DPO 的 $\beta$ 直接给 SimPO。

## 七、与开源书/权威来源对应
Rafailov 2023 DPO；Meng 2024 SimPO 给出等价性讨论。

## 八、面试题
问：SimPO 少了 KL 约束会怎样？答：需靠长度归一与 margin 防分布漂移，过拟合风险略高。

## 九、演进与趋势
带轻量锚定项的 SimPO 变体。

## 十、小结
SimPO 是 DPO 的无参考简化，权衡显式约束换简洁。
