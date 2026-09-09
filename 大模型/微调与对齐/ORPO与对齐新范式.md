# ORPO 与对齐新范式

> 对应 Hong et al., *ORPO: Monolithic Preference Optimization without Reference Model*, 2024，及近期免奖励对齐方法（SimPO、RRHF 等）综述。

## 一、背景与挑战

经典对齐流程 RLHF/DPO 需要「偏好数据 + 参考模型」：RLHF 训练奖励模型再跑 PPO，DPO 仍需冻结参考模型 $\pi_{ref}$ 计算隐式奖励。这带来额外显存、训练阶段与超参（如 $\beta$）负担。一个自然的问题是：能否把「SFT 监督信号」与「偏好排斥信号」合并到单一阶段，且完全不依赖参考模型？ORPO 给出了肯定答案，代表了「单阶段、免参考」的对齐新范式。

## 二、核心原理

ORPO（Odds Ratio Preference Optimization）在普通 SFT 损失上叠加一个**偏好 odds-ratio 正则项**，对「被拒绝回答 $y_l$」施加指数级惩罚，对「被选回答 $y_w$」轻微鼓励，从而在监督学习的同时完成对齐：

$$
\mathcal{L}_{\text{ORPO}} = \mathcal{L}_{\text{SFT}} + \lambda \cdot \mathcal{L}_{\text{OR}}
$$

其中 $\mathcal{L}_{\text{OR}}$ 基于几率比（odds ratio）：

$$
\mathcal{L}_{\text{OR}} = -\log \sigma\!\left(\log \frac{\text{odd}(y_w)}{\text{odd}(y_l)}\right),\quad \text{odd}(y)=\frac{\pi_\theta(y\mid x)}{1-\pi_\theta(y\mid x)}
$$

注意这里所有项都来自**同一个策略 $\pi_\theta$**，无需冻结的 $\pi_{ref}$。

## 三、形式化与数学基础

把模型对回答 $y$ 的几率定义为 $\text{odd}(y)=\pi_\theta(y\mid x)/(1-\pi_\theta(y\mid x))$。当 $y_w$ 的几率相对 $y_l$ 越高，正则项越小。展开可得其对数的梯度方向近似等价于「提升 $y_w$ 概率、压低 $y_l$ 概率」，且由于是几率比形式，惩罚随 $\pi_\theta(y_l)$ 增大而呈对数放大，比单纯交叉熵排斥更平滑稳定。

与 DPO 对比：DPO 的隐式奖励 $r(x,y)=\beta\log(\pi_\theta/\pi_{ref})+\beta\log Z(x)$ 依赖 $\pi_{ref}$；ORPO 直接把偏好融入主模型的几率结构，**无需任何参考模型**，参训显存与计算省去一份副本。

## 四、代码实现

```python
import torch.nn.functional as F

def orpo_loss(logp_w, logp_l, lambda_=0.1):
    # logp_w, logp_l: 策略对选/拒回答的对数似然（序列均值）
    log_odds_w = logp_w - torch.log1p(-torch.exp(logp_w))
    log_odds_l = logp_l - torch.log1p(-torch.exp(logp_l))
    lor = -F.logsigmoid(log_odds_w - log_odds_l)
    sft = -logp_w
    return sft + lambda_ * lor.mean()
```

## 五、与其他技术对比

| 方法 | 参考模型 | 阶段数 | 额外超参 | 显存（相对） |
|------|----------|--------|----------|--------------|
| PPO/RLHF | 需要 | 多（SFT→RM→RL） | 多（KL、clip 等） | 高 |
| DPO | 需要（冻结） | 单 | $\beta$ | 中 |
| ORPO | 不需要 | 单（SFT 融合） | $\lambda$ | 低 |
| SimPO | 不需要（无参考） | 单 | $\gamma$ | 低 |

## 六、常见误区

- 认为 ORPO 只是「SFT + 负样本」：其几率比惩罚比普通对比损失更关注被拒样本的指数级压制，本质不同。
- 把 $\lambda$ 设得过大：会破坏 SFT 主体信号，导致语言质量下降。
- 用单条样本而非偏好对：ORPO 仍需 $(y_w, y_l)$ 配对，不能退化为纯 SFT。
- 误以为免参考就无需高质量偏好数据：数据噪声同样会误导对齐方向。

## 七、与开源书·权威来源对应

- Hong et al., *ORPO: Monolithic Preference Optimization without Reference Model*, 2024（arXiv:2402.10719）。
- Meng et al., *SimPO: Simple Preference Optimization*, 2024 同属免参考范式。
- Rafailov et al., *DPO*, 2023 作为对照方法。

## 八、面试题

- ORPO 相比 DPO 去掉了什么？带来哪些实际好处？
- 为什么 ORPO 不需要参考模型也能避免模型塌缩到 rejection？
- $\mathcal{L}_{\text{OR}}$ 中的几率比与朴素对比损失有何区别？
- 单阶段对齐有何局限？

## 九、演进与趋势

ORPO 属于「免参考对齐」浪潮，与 SimPO（直接以序列似然长度归一化作奖励）、RRHF（排序损失融合）等并列。趋势是用更少的模型副本与阶段达成稳定对齐，并探索参考无关下的长度偏差校正。以官方最新文档为准。

**实践要点：**

- ORPO 对超参 $\lambda$ 较敏感：过小对齐不足，过大压垮 SFT 信号，常用搜索区间约 0.05~0.5，配合学习率共同调。
- 数据构造上仍需要「被选/被拒」配对，且拒绝样本应真实弱于被选样本，否则正则项失去方向。
- 与 DPO 相比，ORPO 省去一份参考模型显存，在单卡上训练大模型对齐时优势明显。
- 训练后期可叠加少量拒绝采样 SFT 进一步提升指令质量，形成「ORPO + RFT」组合。

## 十、小结

ORPO 用几率比正则把 SFT 与偏好学习合二为一，省去参考模型与多阶段流程，是轻量对齐的代表性新范式；实践中以 SFT 数据为主、偏好对为辅即可见效。
