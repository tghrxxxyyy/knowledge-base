# 与RLAIF及宪法AI结合

> 对应 Bai et al. 2022（Constitutional AI）、Lee et al. 2023（RLAIF）与 Rafailov et al. 2023（DPO）。

## 一、背景与挑战

自我批判天然产出「草稿—修订」成对数据，这恰好是偏好学习所需的原材料。把批判产出的（修订稿，草稿）作为 RLAIF 的偏好对，就能构建几乎不需要人工标注的对齐循环：模型自己找问题、自己改、再用改的结果训练自己。这一思路极具吸引力，因为它把对齐数据的生产成本从「人力线性增长」变为「算力线性增长」。挑战在于：自举循环缺乏外部锚点时，模型的既有偏差会被不断放大；原则写得过宽会导致修订无实质改进，偏好对变成噪声；此外修订稿与草稿往往只差几个词，偏好信号微弱，训练时容易出现过拟合与长度偏移。因此需要原则约束、质量闸门与人类校准三道防线。

## 二、核心原理

完整的自举流水线由五个环节组成：

1. 原则集（宪法）：把价值与安全规范写成自然语言条款，每条尽量可判定、可举例。原则决定批判的指向，是整个流程的方向盘。
2. 生成与采样：对输入 $x$ 采样多个候选回答，既提供批判对象，也提供修订的参照。
3. 原则式批判：模型依据具体条款指出候选回答违反了哪一条、为什么，输出结构化条目。
4. 修订与偏好构造：模型依据批判产出修订稿 $y_{\text{rev}}$，与草稿 $y_{\text{init}}$ 组成偏好对 $(y_{\text{rev}} \succ y_{\text{init}})$；经质量过滤后进入训练集。
5. 训练与校准：用 DPO 直接优化偏好，或先训练奖励模型再用 PPO/GRPO 优化；最后用少量人类偏好做校准与验证。

宪法 AI 的关键设计是「先批判后蒸馏」：批判阶段在推理时完成并可被审计，训练阶段把批判的成果固化进参数，最终部署时不再需要显式的批判提示。此外，对有害请求还可做「原则式拒答」，把拒答理由与原则编号一并输出，使拒答行为可解释、可复核。

## 三、形式化与数学基础

偏好对构造可写为映射：

$$ \mathcal{D} = \{(x,\ y_{\text{rev}} \succ y_{\text{init}})\}, \quad y_{\text{rev}} = M\big(\text{revise}(x, y_{\text{init}}, C)\big) $$

其中 $C$ 为原则集合。随后用 DPO 损失优化策略向修订稿靠拢：

$$ \mathcal{L}_{\text{DPO}} = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma\!\left( \beta \log \frac{\pi_\theta(y_w \mid x)}{\pi_{\text{ref}}(y_w \mid x)} - \beta \log \frac{\pi_\theta(y_l \mid x)}{\pi_{\text{ref}}(y_l \mid x)} \right) \right] $$

若走奖励模型路线，则用 Bradley–Terry 模型拟合偏好：

$$ \mathcal{L}_R = -\mathbb{E}_{(x, y_w, y_l)}\big[\log \sigma\big(r(x, y_w) - r(x, y_l)\big)\big] $$

质量闸门可形式化为：仅当修订稿相对草稿的奖励差超过阈值时保留样本，

$$ \text{keep} \iff r(x, y_{\text{rev}}) - r(x, y_{\text{init}}) > \delta $$

$\delta$ 过小会引入大量近义改写噪声，过大则样本量不足。人类校准的作用是提供分布外锚点，用少量人类偏好检验 AI 偏好的一致性：

$$ \text{agreement} = \frac{1}{M}\sum_{i=1}^{M} \mathbb{1}\big[\hat{y}^{AI}_i = \hat{y}^{H}_i\big] $$

一致性明显下降时，说明自举循环已经偏离，需要补入人类数据或修订原则。

## 四、代码实现

```python
# 自举偏好：原则式批判 -> 修订 -> 质量过滤 -> 进入 DPO
def bootstrap(model, x, principles, scorer, delta=0.05):
    y0 = model.generate(x)
    crit = model.generate(
        "依据以下原则逐条检查，指出违反项：\n"
        + "\n".join(f"- {p}" for p in principles)
        + "\n\n待检查回答：\n" + y0
    )
    if not extract_issues(crit):
        return None                     # 无违反项，不产生偏好对

    y1 = model.generate(
        f"根据批评修订回答，保持原意与格式：\n原回答：{y0}\n批评：{crit}\n修订："
    )
    if scorer(x, y1) - scorer(x, y0) <= delta:
        return None                     # 改进不足，过滤掉噪声样本
    if abs(len(y1) - len(y0)) / max(len(y0), 1) > 0.5:
        return None                     # 长度剧变，可能是废话式改写
    return {"prompt": x, "chosen": y1, "rejected": y0}


def build_dataset(model, prompts, principles, scorer):
    data = [d for d in (bootstrap(model, p, principles, scorer) for p in prompts) if d]
    return dedup(data)


def human_calibration(ai_prefs, human_prefs):
    # 一致性是判断自举是否偏离的核心信号
    same = sum(1 for a, h in zip(ai_prefs, human_prefs) if a == h)
    return same / max(len(human_prefs), 1)
```

## 五、与其他技术对比

- 自举 RLAIF vs 纯人类 RLHF：前者成本极低、可规模化；后者质量高、有外部锚点，但昂贵且慢。
- 自举 RLAIF vs 无批判 RLAIF：加入原则式批判后，偏好对更有针对性、可解释、可审计，而非单纯「模型更喜欢哪个」。
- DPO 路线 vs 奖励模型 + PPO：DPO 简单稳定、无需奖励模型；PPO 上限更高但需防奖励黑客。
- 训练期固化 vs 推理期批判：前者零推理开销但迭代慢，后者可热更但每次都要付出成本，实践中常先推理后固化。

## 六、常见误区

- 「原则越宽越好」：原则过宽导致批判空洞、修订无实质改进，偏好对退化为近义改写。
- 「自举可以完全替代人类」：缺少外部锚点时偏差被循环放大，至少需用人类保留集监控一致性。
- 「所有偏好对都该保留」：改进幅度小、长度剧变、重复的样本应过滤，否则训练信号被稀释。
- 「批判后必然更合规」：模型自偏好会让修订「看起来更好」，必须由独立信号验证。

## 七、与开源书·权威来源对应

- Bai et al. 2022（Constitutional AI）：提出原则式自批判与自标注，并结合 RLAIF 训练，是本范式的基础工作。
- Lee et al. 2023（RLAIF）：系统比较 AI 反馈与人类反馈，讨论自举的可行性与偏差风险。
- Rafailov et al. 2023（DPO）：把偏好学习转为闭式优化，使自举数据可直接用于训练。
- HuggingFace TRL：提供 DPOTrainer、RewardTrainer 等实现消费自举产出的数据（接口以官方最新文档为准）。

## 八、面试题

1. 自举对齐为何必须保留少量人类校验？保留在哪一步最有效？
2. 原则集应如何设计，才能让批判具体、可判定、可审计？
3. 偏好对质量不佳会如何损害训练？有哪些具体的过滤规则？
4. 训练期固化与推理期批判如何配合以兼顾成本与迭代速度？

## 九、演进与趋势

该方向正从「人工写原则 + 单次自举」走向「可验证原则 + 人类在环 + 持续迭代」：把原则写成可自动测试的断言，用对抗样本验证模型是否真正遵守；在多轮自举中持续监控 AI 偏好与人类偏好的一致性，一旦偏离即触发人工介入；引入多模型委员会标注降低单一模型的系统性偏差；并把自举数据、原则版本、批判日志一并纳入审计，使对齐过程本身可追溯。

## 十、小结

自我批判 + RLAIF + 宪法原则构成可扩展的自标注流水线：批判提供方向，原则提供约束与可解释性，训练把成果固化进参数。其成败取决于原则质量、数据过滤与人类校准这三道防线。
