# ORPO与SFT及DPO对比

> 对应 Hong 2024 ORPO 与 Rafailov 2023 DPO。

## 一、背景与挑战

大模型对齐有 SFT（监督微调）、DPO（直接偏好优化）、RLHF（基于奖励的强化学习）等路线。ORPO（Odds Ratio Preference Optimization，Hong 2024）提出把微调与偏好对齐合并为单阶段，省去独立对齐步骤。厘清三者谱系位置有助于按数据与算力选型。实际工程中，选型还受「是否有参考模型」「数据是否配对」「是否需要在线采样」影响，不能仅看效果数字。此外，不同方法对训练稳定性的假设不同：RLHF 需奖励模型且易奖励黑客，DPO 需两阶段且对参考模型敏感，ORPO 试图以单阶段无参考模型换取简洁。

## 二、核心原理

- SFT：仅用优质回答 $(x,y_w)$ 做负对数似然模仿，无偏好信号。
- DPO：先 SFT warm-start，再用配对偏好 $(y_w,y_l)$ 做偏好损失，两阶段。
- ORPO：在 SFT 损失上直接叠加基于 odds ratio 的偏好项，单阶段联合优化，省去独立对齐。

三者目标不同：SFT 学「像」，DPO/ORPO 学「偏好优者、劣者弃」。ORPO 与 KTO 同属「无参考模型」一脉，但 KTO 用单边信号、ORPO 用配对，数据形态不同。直观上，SFT 是地基，DPO 在地基上再做偏好层，ORPO 则把偏好层直接焊进地基。

## 三、形式化与数学基础

SFT 损失：

$$
\mathcal{L}_{\mathrm{SFT}}=-\,\mathbb{E}_{(x,y_w)}\big[\log\pi_\theta(y_w\mid x)\big]
$$

DPO 配对偏好损失：

$$
\mathcal{L}_{\mathrm{DPO}}=-\,\mathbb{E}\Big[\log\sigma\Big(\beta\log\frac{\pi_\theta(y_w)}{\pi_{\mathrm{ref}}(y_w)}-\beta\log\frac{\pi_\theta(y_l)}{\pi_{\mathrm{ref}}(y_l)}\Big)\Big]
$$

ORPO 损失为 SFT 与 OR 项之和：

$$
\mathcal{L}_{\mathrm{ORPO}}=\mathcal{L}_{\mathrm{SFT}}+\lambda\,\mathcal{L}_{\mathrm{OR}}
$$

其中 $\mathcal{L}_{\mathrm{OR}}$ 由所选/拒答的 odds 比构造（见「ORPO单阶段对齐深入/ORPO的odds比率损失」）。三者梯度结构差异决定了训练动态与稳定性：DPO 依赖 ref 锚定，ORPO 靠 SFT 项自锚定。

## 四、代码实现

```python
# 三方法损失对照(示意, 省略参考模型与 logp 计算)
loss_sft = -logp_y.mean()                       # SFT: 仅模仿优选
loss_dpo = dpo_loss(logp_w, logp_l, logp_ref_w, logp_ref_l, beta=0.1)
loss_orpo = loss_sft + lam * orpo_term(logp_w, logp_l)   # SFT + OR 项

def pick_method(has_ref, paired, budget):
    # 极简选型: 依资源与数据形态
    if not paired:
        return "SFT"
    if has_ref and budget.high:
        return "DPO"
    return "ORPO"
```

## 五、与其他技术对比

| 方法 | 阶段 | 数据 | 灵活度 | 算力 | 参考模型 |
| --- | --- | --- | --- | --- | --- |
| SFT | 1 | 优选 | 低 | 低 | 否 |
| DPO | 2 | 配对+ref | 高 | 中 | 是 |
| ORPO | 1 | 配对(SFT项内含) | 中 | 低 | 否 |
| KTO | 1+ | 单边 | 中 | 低 | 是 |

## 六、常见误区

- 以为 ORPO 比 DPO 总是更优：取决数据与算力，复杂偏好仍宜 DPO/RLHF。
- 忽略 $\lambda$ 平衡：过大压制语言建模，过小对齐无效。
- 误以为可跳 SFT：ORPO 内含 SFT 项，仍需优选数据。
- 把 ORPO 当独立对齐方法：它是挂在 SFT 上的正则项。
- 用错 logp 来源：OR 项须用同一前向的 log_softmax，避免数值错位。

## 七、与开源书·权威来源对应

- Hong 2024《ORPO》对比实验与实现。
- Rafailov 2023《DPO》提出配对偏好直接优化。
- huggingface/trl 提供 SFTTrainer、DPOTrainer、ORPOTrainer 三种 Trainer，可互相对照。

## 八、面试题

- 何时选 ORPO？与 DPO/RLHF 的边界？
- ORPO 为何仍需优选数据？OR 项与 SFT 项如何平衡？
- ORPO 与 KTO 在数据形态上有何不同？为何 DPO 对参考模型敏感？

## 九、演进与趋势

ORPO 与在线采样、课程式 $\lambda$ 调度结合；单阶段与两阶段混合成为新方向。无参考模型方法（ORPO/SimPO/KTO）互相借鉴稳定性技巧，形成与 DPO/RLHF 并行的轻量对齐谱系，并在小模型对齐上展现性价比优势。

（补充）选型时还应考虑组织成熟度：若团队尚无参考模型管理经验，ORPO 的无 ref 特性反而降低运维负担；若已有高质量奖励模型与偏好数据，DPO/RLHF 的可调空间更大。实践要点：

- 以「是否有配对数据」为第一道分叉：无配对先 SFT，有配对再考虑对齐方法。
- 以「偏好是否复杂」为第二道分叉：轻量指令对齐选 ORPO，复杂多轮选 DPO。
- 以「算力预算」为第三道分叉：预算紧时 ORPO 的单阶段更省，预算宽时 DPO 更稳。
- 无论选哪种，都用同一验证集做端到端胜率评测，避免被训练损失误导。

需要强调的是，三种方法并非互斥：工业界常见「SFT → ORPO/DPO → 在线 RLHF」的分层对齐流水线，每层解决不同精度的偏好信号。

## 十、小结

ORPO 在 SFT 与 DPO 间取折衷：以单阶段联合优化简化流程，但有配对数据且偏好不极复杂时最划算。选型应同时看数据形态、参考模型可用性与算力预算，而非盲目追新。
