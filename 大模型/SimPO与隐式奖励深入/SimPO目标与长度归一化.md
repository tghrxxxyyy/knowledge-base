# SimPO目标与长度归一化

> 对应 Meng 2024 SimPO 与 Rafailov 2023 DPO。

## 一、背景与挑战
DPO 的隐式奖励含参考模型项，推理需加载 $\pi_{ref}$ 且易偏好长回答。SimPO(Simple Preference Optimization)用长度归一化隐式奖励，去掉参考模型依赖。

## 二、核心原理
SimPO 定义隐式奖励为策略平均对数概率除以长度：
$r(x,y)=\frac{\beta}{|y|}\log\pi_\theta(y|x)$
并配合目标奖励 margin $\gamma$ 区分优劣。

## 三、形式化与数学基础
SimPO 损失：
$\mathcal{L}_{SimPO}=-\mathbb{E}[\log\sigma(\frac{\beta}{|y_w|}\log\pi_\theta(y_w|x)-\frac{\beta}{|y_l|}\log\pi_\theta(y_l|x)-\gamma)]$
无 $\pi_{ref}$ 项，训练与推理均只用一个模型。

## 四、代码实现
# SimPO 隐式奖励与损失
import torch.nn.functional as F

def simpo_reward(logp_seq, length, beta=1.0):
    return beta * logp_seq / length

def simpo_loss(lw, ll, nw, nl, beta=1.0, gamma=1.0):
    rw = beta * lw / nw
    rl = beta * ll / nl
    return -F.logsigmoid(rw - rl - gamma).mean()

## 五、与其他技术对比
相比 DPO 省去参考模型、抑制长度偏差；相比 KTO 仍用配对数据但奖励更简洁。

## 六、常见误区
忘记长度归一化导致偏长；$\gamma$ 与 $\beta$ 混淆尺度。

## 七、与开源书/权威来源对应
Meng 2024 SimPO 论文；huggingface/trl 近期支持 SimPO 风格损失。

## 八、面试题
问：SimPO 为何能去掉参考模型？答：用策略自身平均对数概率作奖励，参考模型项被重新参数化消除。

## 九、演进与趋势
与长度控制正则、在线 SimPO 结合。

## 十、小结
SimPO 以长度归一化隐式奖励简化对齐，省显存且抗长偏好。
