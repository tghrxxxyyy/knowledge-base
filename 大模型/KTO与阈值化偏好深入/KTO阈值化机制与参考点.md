# KTO阈值化机制与参考点

> 对应 Ethayarajh 2024 KTO 与 Kahneman 1979 前景理论。

## 一、背景与挑战
人类评估有参照依赖与损失厌恶，KTO 用阈值(参考点)体现这点：相对参考模型的改进才被奖励。

## 二、核心原理
阈值 $m_{desirable},m_{undesirable}$ 是隐式奖励的参考点。只有超出正阈值的可取样本、低于负阈值的不可取样本才产生梯度，其余被 margin 截断。

## 三、形式化与数学基础
效用基于偏离参考点的收益/损失：
$u(z)=\begin{cases}z-m_{desirable},& z\ge m_{desirable}\\ z+m_{undesirable},& z\le -m_{undesirable}\end{cases}$
其中 $z=r(x,y)$。

## 四、代码实现
# 阈值截断
def kto_utility(z, m_pos=1.0, m_neg=1.0):
    if z >= m_pos:
        return z - m_pos
    if z <= -m_neg:
        return z + m_neg
    return 0.0   # 落在无梯度区

## 五、与其他技术对比
DPO 用成对 log-ratio 差无显式阈值；KTO 的 margin 提供隐式正则，更抗噪。

## 六、常见误区
阈值全设为 0 退化为普通回归；忽视正负阈值不对称反映损失厌恶。

## 七、与开源书/权威来源对应
Ethayarajh 2024 给出默认阈值经验值；huggingface/trl 暴露 desirable/undesirable 阈值。

## 八、面试题
问：阈值如何体现损失厌恶？答：负向惩罚区更敏感，模型更规避变差的输出。

## 九、演进与趋势
自适应阈值随训练动态调整。

## 十、小结
阈值是 KTO 对齐人类风险态度的核心旋钮。
