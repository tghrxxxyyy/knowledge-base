# ORPO单阶段对齐原理

> 对应 Hong 2024 ORPO 与 Ouyang 2022 InstructGPT。

## 一、背景与挑战

标准对齐通常需两阶段：先 SFT 获得基础能力，再 RLHF/DPO 做偏好对齐。ORPO（Odds Ratio Preference Optimization，Hong 2024）提出把监督微调与偏好对齐合并为单阶段，在常规 SFT 负对数似然损失上叠加基于 odds ratio 的偏好项，使模型在学知识的同时远离不喜爱回答，省去独立对齐步。其动机是：两阶段流程繁琐、需保存参考模型、且阶段间分布易漂移。ORPO 用「SFT 自锚定 + OR 正则」规避了参考模型依赖。

## 二、核心原理

ORPO 在 SFT 损失上增加 OR 项。SFT 项保证模型拟合优选回答的语言与事实；OR 项利用所选/拒答的 odds 比，使模型相对提升优选、压低拒答的概率。二者联合优化，一步完成微调+对齐。它仍属离线偏好优化（无需奖励模型、无需在线采样），但与 DPO 不同：DPO 需参考模型且两阶段，ORPO 直接挂在 SFT 上。直观上，OR 项相当于对「拒绝回答」施加一种相对惩罚，而 SFT 项保住生成能力，二者合力塑造偏好，且不会因参考模型偏离而产生 DPO 的漂移问题。

## 三、形式化与数学基础

ORPO 损失为 NLL 与 OR 项之和：

$$
\mathcal{L}_{\mathrm{ORPO}}=\mathcal{L}_{\mathrm{SFT}}+\lambda\,\mathcal{L}_{\mathrm{OR}}
$$

其中 SFT 项为：

$$
\mathcal{L}_{\mathrm{SFT}}=-\,\mathbb{E}_{(x,y_w)}\big[\log\pi_\theta(y_w\mid x)\big]
$$

OR 项基于 odds ratio（详见「ORPO单阶段对齐深入/ORPO的odds比率损失」）：

$$
\mathcal{L}_{\mathrm{OR}}=-\,\mathbb{E}\Big[\log\sigma\Big(\mathrm{logodds}(y_w)-\mathrm{logodds}(y_l)\Big)\Big]
$$

$\lambda$ 控制对齐强度。当 $\lambda\to 0$ 退化为纯 SFT；增大 $\lambda$ 偏好信号增强但可能损语言。这种「SFT 内含对齐」的结构，使 ORPO 在单卡上即可完成原本需两阶段的流程。

## 四、代码实现

```python
import torch.nn.functional as F

def orpo_loss(nll, logp_chosen, logp_rejected, lam=0.1):
    # 以 log-odds 差构造 OR 项
    odds_c = torch.exp(logp_chosen)
    odds_r = torch.exp(logp_rejected)
    or_term = -F.logsigmoid(torch.log(odds_c) - torch.log(odds_r)).mean()
    return nll + lam * or_term

def train_orpo(model, loader, lam=0.1, epochs=1):
    # 单阶段训练循环: SFT 与对齐同时发生
    for _ in range(epochs):
        for x, yw, yl in loader:
            nll = sft_loss(model, x, yw)
            or_t = orpo_loss(nll, *pref_logps(model, x, yw, yl))
            or_t.backward(); opt.step(); opt.zero_grad()
```

## 五、与其他技术对比

| 方法 | 是否需 ref | 阶段 | 数据 |
| --- | --- | --- | --- |
| DPO | 是 | 2 | 配对 |
| KTO | 是 | 1+(SFT) | 单边 |
| ORPO | 否 | 1 | 配对(SFT内含) |

ORPO 相比 DPO 省去参考模型与独立对齐；相比 KTO 仍用配对数据。它是轻量对齐的代表，与 SimPO 同属无 ref 族群，区别在于偏好信号的参数化方式。

## 六、常见误区

- 误以为可完全跳过 SFT：ORPO 内含 SFT 项，仍需优选数据。
- $\lambda$ 过大压制语言建模：对齐强但流畅度掉。
- 与 DPO 混用参考模型：ORPO 不需要 ref，引入反而改变语义。
- 用错 logp 来源：OR 项须用同一前向的 log_softmax，避免数值错位。
- 以为无 ref 就更稳：无 ref 也依赖 SFT 项质量，弱 SFT 数据照样失败。

## 七、与开源书·权威来源对应

- Hong 2024《ORPO: Monolithic Preference Optimization without Reference Model》原论文。
- huggingface/trl 提供 ORPOTrainer 实现。
- Ouyang 2022《InstructGPT》两阶段对齐范式对比。

## 八、面试题

- ORPO 如何省去独立对齐阶段？为何不需参考模型？
- $\lambda$ 的作用与调参经验？$\lambda\to 0$ 时退化为何？
- ORPO 与 SimPO 的共性与差异？为何说它靠 SFT 自锚定？

## 九、演进与趋势

与指令混合数据、课程式 $\lambda$ 调度；与 SimPO 等无 ref 方法互相借鉴稳定性技巧。研究正探索把 OR 项扩展到序列级边际、与过程奖励结合，并在小模型上验证其性价比优势。

（补充）理解 ORPO 的关键类比，是把它看作「带偏好正则的 SFT」：SFT 项保证模型会说话，OR 项保证模型说「对」的那一类话更多。因此它最擅长的是「风格与轻度偏好对齐」，而非「复杂价值学习」。实践要点：

- 准备数据时，SFT 样本应覆盖目标域的格式与知识，否则 OR 项会在错误基础上对齐。
- 把 $\lambda$ 当作超参纳入搜索，而非固定经验值，不同数据规模下最优 $\lambda$ 差异明显。
- 训练早期可适当降低 $\lambda$ 让语言建模先稳住，中后期再加大偏好权重（课程式）。
- 用胜率而非困惑度评估对齐效果，困惑度好不代表偏好方向正确。

从生态看，ORPO 降低了小团队做对齐的门槛：无需维护参考模型、无需两阶段流程，一个 Trainer 即可启动，这正是它在资源受限场景受欢迎的原因。

## 十、小结

ORPO 以单阶段统一微调与对齐：把偏好 odds 项直接加进 SFT 损失联合优化，简化流程且效果可观。它本质是「带偏好正则的 SFT」，理解这一点是正确调参的前提，也是判断其适用边界的钥匙。
