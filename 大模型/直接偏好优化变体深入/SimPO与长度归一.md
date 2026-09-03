# SimPO 与长度归一

> 对应 Meng et al., *SimPO: Simple Preference Optimization with a Reference-Free Reward*, NeurIPS 2024；长度相关性证据见 Singhal et al., *A Long Way to Go: Investigating Length Correlations in RLHF*, 2023。

## 一、背景与挑战

DPO 的隐式奖励是序列对数似然比之和，与序列长度直接相关：同样质量的两个回答，更长的那个通常累积更多对数概率差，于是优化过程会系统性偏好啰嗦答案。这既是评测上的「长度偏置」，也是训练目标与解码目标不一致的表现——解码时我们常按平均对数似然打分，训练时却按累加值优化。

## 二、核心原理

SimPO 做两件事：其一，把奖励改为长度归一化的平均对数似然，使奖励与生成时的打分方式对齐，同时消去长度项；其二，引入目标奖励间隔 $\gamma$，要求胜者奖励不仅高于败者，而且要高出一个安全边界，从而提升偏好可分性。由于奖励不再含参考模型项，SimPO 也天然是 reference-free。

## 三、数学形式

$$\mathcal L_{SimPO}=-\mathbb E\Big[\log\sigma\Big(\frac{\beta}{|y_w|}\log\pi_\theta(y_w|x)-\frac{\beta}{|y_l|}\log\pi_\theta(y_l|x)-\gamma\Big)\Big]$$

其中 $|y|$ 为 token 数。对比 DPO：奖励从 $\beta\log\frac{\pi_\theta}{\pi_{ref}}$（累加、含参考）变为 $\frac{\beta}{|y|}\log\pi_\theta$（平均、无参考），并额外减去间隔 $\gamma$。

## 四、代码实现

```python
import torch.nn.functional as F

def simpo_loss(sum_lp_w, len_w, sum_lp_l, len_l, beta=2.0, gamma=1.0):
    r_w = beta * sum_lp_w / len_w          # 长度归一奖励
    r_l = beta * sum_lp_l / len_l
    return -F.logsigmoid(r_w - r_l - gamma).mean()

# 训练步：无需 ref 模型前向，显存与吞吐都优于 DPO
def step(model, batch, opt):
    sw, lw = seq_logp(model, batch["chosen"])       # 返回(对数似然和, 长度)
    sl, ll = seq_logp(model, batch["rejected"])
    loss = simpo_loss(sw, lw, sl, ll)
    loss.backward(); opt.step(); opt.zero_grad()
    return loss.item()
```

## 五、与其他对比

- 相对 DPO：显存更省（无 ref）、长度偏置更轻；但失去 KL 锚点，需要靠 $\beta,\gamma$ 与早停控制偏离。
- 相对 ORPO：都无参考，但 SimPO 不显式保留 SFT 项，因此更依赖初始 SFT 模型质量。
- 与 奖励模型过优化与奖励黑客深入：长度偏置是奖励代理被利用的典型案例，长度归一是一种目标层面的缓解。

## 六、常见误区

- 以为长度归一就彻底消除了长度偏置。若偏好数据本身偏好长答案，偏置会从目标转移到数据里。
- $\beta$ 直接沿用 DPO 值。归一化改变了奖励尺度，$\beta$ 通常需要显著上调。
- $\gamma$ 过大导致大量样本落在 sigmoid 饱和区，梯度消失、训练停滞。

## 七、与开源书对应

- mlabonne/llm-course（偏好优化实践与对比）：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch（自实现打分与训练细节）：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- SimPO 的奖励为什么要长度归一？答：让训练奖励与解码时的平均对数似然打分一致，并消除累加对数概率带来的长度偏好。
- 目标间隔 $\gamma$ 的作用？答：要求胜者奖励高出一个边界，提升偏好判别的裕度，抑制「勉强分开」的弱解。

## 九、演进

累加似然比奖励（DPO） → 长度归一奖励 → 加入目标间隔（SimPO） → 与噪声鲁棒、多目标偏好联合。

## 十、小结

SimPO 用「长度归一 + 目标间隔 + 去参考」三件套换来更省显存、更少长度偏置的偏好优化，但对基座质量和超参尺度更敏感。
