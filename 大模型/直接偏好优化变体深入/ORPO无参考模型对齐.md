# ORPO 无参考模型对齐

> 对应 Hong et al., *ORPO: Monolithic Preference Optimization without Reference Model*, EMNLP 2024。

## 一、背景与挑战

标准对齐是两阶段：先 SFT，再 DPO/PPO。这带来两项成本：训练要跑两遍，且偏好阶段要常驻参考模型（显存约翻倍，或额外一次前向）。更微妙的问题是，SFT 阶段只做最大似然，会同时提升被拒绝回答的似然（因为它们在语言层面同样流畅），给后续偏好阶段留下负担。

## 二、核心原理

ORPO 把两阶段合成一个单体目标：在 SFT 的负对数似然上，加一个 odds ratio 惩罚项，直接压低被拒回答的生成几率。关键点是它用 odds（几率）而非 log-prob 差来度量对比强度——odds ratio 的梯度在两者概率接近时较温和、在被拒答案概率偏高时惩罚更强，从而无需参考模型也能保持稳定。

## 三、数学形式

定义 $\mathrm{odds}_\theta(y|x)=\dfrac{P_\theta(y|x)}{1-P_\theta(y|x)}$，其中 $P_\theta$ 取长度归一的序列似然。则

$$\mathcal L_{ORPO}=\mathcal L_{SFT}+\lambda\,\mathcal L_{OR},\qquad \mathcal L_{OR}=-\log\sigma\Big(\log\frac{\mathrm{odds}_\theta(y_w|x)}{\mathrm{odds}_\theta(y_l|x)}\Big)$$

$\mathcal L_{SFT}=-\log P_\theta(y_w|x)$ 保证生成能力，$\mathcal L_{OR}$ 提供偏好方向，$\lambda$ 平衡二者。

## 四、代码实现

```python
import torch, torch.nn.functional as F

def orpo_loss(sum_lp_w, len_w, sum_lp_l, len_l, lam=0.1):
    # 长度归一的平均对数似然 -> log P
    logp_w = sum_lp_w / len_w
    logp_l = sum_lp_l / len_l
    # log odds = log P - log(1 - P)，用 log1p(-exp(logp)) 稳定计算
    log_odds_w = logp_w - torch.log1p(-torch.exp(logp_w).clamp(max=1 - 1e-6))
    log_odds_l = logp_l - torch.log1p(-torch.exp(logp_l).clamp(max=1 - 1e-6))
    l_or = -F.logsigmoid(log_odds_w - log_odds_l).mean()
    l_sft = -logp_w.mean()
    return l_sft + lam * l_or
```

## 五、与其他对比

- 相对 DPO：省掉参考模型与独立 SFT 阶段，显存与流水线都更轻；代价是失去 KL 锚点，偏离基座的程度不再显式可控。
- 相对 SimPO：两者都无参考模型，但 SimPO 保留成对 logistic 形式并引入间隔，ORPO 则把偏好项挂在 SFT 上。
- 与 对齐税与能力保持深入：ORPO 保留 SFT 项本身就是一种能力保持机制。

## 六、常见误区

- 认为「无参考模型 = 无正则」。ORPO 的 SFT 项与 odds 形态共同起到了隐式约束作用，但确实弱于显式 KL。
- $\lambda$ 设得过大，模型为了压低被拒回答而牺牲流畅度，出现退化重复。
- 直接把未经长度归一的序列似然塞进 odds，长序列概率极小会让数值全部饱和。

## 七、与开源书对应

- mlabonne/llm-course（单阶段对齐与实践脚本）：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch（SFT 训练循环，便于加入额外惩罚项）：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- ORPO 为何能去掉参考模型？答：它用 odds ratio 在同一模型内部构造对比信号，并保留 SFT 项作为分布锚定，不再依赖外部分布参考。
- ORPO 与「先 SFT 再 DPO」的本质区别？答：把偏好信号提前到 SFT 同一步，避免 SFT 阶段无差别抬高被拒回答的似然。

## 九、演进

SFT + PPO → SFT + DPO → ORPO 单体目标 → 单体目标与在线数据流结合。

## 十、小结

ORPO 用 odds ratio 惩罚把偏好优化融进 SFT，是「流水线简化」方向上最具代表性的变体，适合显存紧张、迭代频繁的场景。
