# KTO目标函数与人类效用

> 对应 Ethayarajh 2024 KTO 与 Ouyang 2022 InstructGPT。

## 一、背景与挑战
DPO 需要成对的(chosen, rejected)数据，而现实中大量是单条(反馈)数据。KTO(Kahneman-Tversky Optimization)用前景理论把对齐建模为最大化人类效用，支持非配对数据。

## 二、核心原理
KTO 对每个输出 $y$ 依其是否"可取"定义效用函数，用参考模型 $\pi_{ref}$ 计算隐式奖励 $r(x,y)=\beta\log\frac{\pi_\theta(y|x)}{\pi_{ref}(y|x)}$，再经非对称损失对齐人类风险偏好。

## 三、形式化与数学基础
损失为：
$\mathcal{L}_{KTO}=\mathbb{E}_{x,y}[(1-\lambda_y)\max(0,m_{desirable}-r(x,y))+\lambda_y\max(0,r(x,y)-m_{undesirable})]$
其中 $r$ 为隐式奖励，$\lambda_y$ 依可取性取 0 或 1。

## 四、代码实现
# KTO 风格损失(简化)
import torch.nn.functional as F

def kto_loss(implicit_r, desirable, m_pos=1.0, m_neg=1.0):
    if desirable:
        return F.relu(m_pos - implicit_r)
    return F.relu(implicit_r + m_neg)

## 五、与其他技术对比
相比 DPO 必须配对，KTO 用单条正负样本即可；相比 PPO 无需奖励模型在线训练。

## 六、常见误区
误以为 KTO 完全不要偏好——仍需要标签标明可取/不可取；阈值 $m$ 随意设导致梯度消失。

## 七、与开源书/权威来源对应
Ethayarajh 2024 KTO 论文提出效用视角；huggingface/trl 实现 KTOTrainer。

## 八、面试题
问：KTO 为何只需单条数据？答：前景理论用相对参考的效用阈值判正负，无需成对比较。

## 九、演进与趋势
与长度控制、多目标 KTO 结合。

## 十、小结
KTO 用人类效用框架把非配对反馈直接转化为对齐信号，降低数据门槛。
