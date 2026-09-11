# 宪法AI与原则式自标注

> 对应 Bai et al. 2022（Constitutional AI: Harmlessness from AI Feedback）、Askell et al. 2021（A General Language Assistant as a Laboratory for Alignment）与 Lee et al. 2023（RLAIF）。

## 一、背景与挑战

纯人类反馈路径的成本与一致性问题，促使研究者寻找「少标注、可解释、可审计」的替代方案。宪法 AI（Constitutional AI, CAI）的核心主张是：把价值与安全规范写成一组自然语言原则（宪法），让模型依据这些原则自我批评与修订，从而在不逐条依赖人类反馈的情况下完成对齐。挑战有四：原则的撰写质量直接决定对齐方向，原则过宽则批判空洞、过细则相互冲突；模型的自我偏好会使「修订后更合规」这一前提并不总成立；原则之间可能冲突（如「有帮助」与「不冒险」），需要显式定义优先级；此外，原则本身的价值来源与合法性也需要治理流程支撑，否则技术再好也缺乏可信基础。

## 二、核心原理

CAI 流程分两个阶段，二者都以原则为中心：

**阶段一：监督学习式的自我修订（SL-CAI）**

1. 用初始模型对一批提示生成回答，其中一部分是有害请求，用于触发拒答行为。
2. 从原则集中随机抽取一条原则，要求模型依据该原则批判自己的回答并修订，得到修订稿。
3. 用（提示, 修订稿）做监督微调，让模型内化「依据原则自我修正」的能力。

**阶段二：强化学习式的 AI 反馈（RL-CAI）**

1. 用 SL-CAI 模型对同一提示采样多个回答。
2. 让模型依据原则对每个回答打分或两两比较，构造偏好对。
3. 训练偏好模型（PM）或奖励模型，再用 PPO/DPO 优化策略。

关键设计有三点：一是「原则抽样」，每次批判只引用少量原则，避免上下文过载并增加数据多样性；二是「链式原则」，把高层价值（如无害）分解为可判定的具体条款；三是「原则式拒答」，对有害请求要求模型输出解释性拒答并引用原则编号，使拒答行为可解释、可复核。工程上，原则集应与模型版本一同版本化管理，并保留批判日志以供审计。

## 三、形式化与数学基础

设原则集合为 $C = \{c_1, \dots, c_m\}$，批判与修订可写为：

$$ \text{crit} = M\big(\text{critique}(x, y_0, c_i)\big), \qquad y_{\text{rev}} = M\big(\text{revise}(x, y_0, \text{crit})\big) $$

其中 $c_i \sim C$ 为抽样得到的原则；偏好构造为 $\mathcal{D} = \{(x,\ y_{\text{rev}} \succ y_0)\}$，随后用带 KL 约束的目标优化策略：

$$ \max_\theta\ \mathbb{E}_{y\sim\pi_\theta}\big[r_\phi(x, y)\big] - \beta\,\mathbb{D}_{\text{KL}}\big(\pi_\theta \,\|\, \pi_{\text{ref}}\big) $$

原则质量可用「原则可判定性」与「覆盖率」刻画。设某原则 $c_i$ 在被引用时确实改变了模型输出的比例为命中率：

$$ \text{hit}(c_i) = \mathbb{E}_{x}\big[\mathbb{1}[y_{\text{rev}} \neq y_0 \mid c_i]\big] $$

命中率长期接近 0 说明原则从未被触发（冗余或过宽），接近 1 则说明原则过强、压制了所有输出（可能过拟合到拒答）。原则集的有效性还可用原则间冲突率衡量：

$$ \text{conflict} = \frac{|\{(c_i, c_j): \exists x,\ \text{verdict}(x, c_i) \neq \text{verdict}(x, c_j)\}|}{\binom{m}{2}} $$

冲突率高时需定义优先级或拆分场景，否则模型批判会自相矛盾。

## 四、代码实现

```python
# 原则式自我批判与修订（SL-CAI 阶段示意）
import random


def constitutional_revise(model, x, y, principles, n_sample=1):
    # 随机抽样原则，避免上下文过载并增加数据多样性
    picked = random.sample(principles, min(n_sample, len(principles)))
    rules = "\n".join(f"[{i}] {p}" for i, p in enumerate(picked))
    crit_prompt = f"依据下列原则审查回答，指出违反之处（引用编号）：\n{rules}\n\n问题：{x}\n回答：{y}\n\n批判："
    crit = model.generate(crit_prompt, temperature=0.0)
    if not extract_issues(crit):
        return None, None        # 无违反项，不产生训练样本
    revise_prompt = f"根据批判修订回答，保持有用信息。\n问题：{x}\n原回答：{y}\n批判：{crit}\n修订："
    return model.generate(revise_prompt), crit


def build_sl_dataset(model, prompts, principles):
    # 阶段一产物：用于监督微调，让模型内化「依据原则自我修正」
    data = []
    for x in prompts:
        y1, _ = constitutional_revise(model, x, model.generate(x), principles)
        if y1:
            data.append({"prompt": x, "response": y1})
    return data


def build_pref_dataset(model, prompts, principles, scorer, delta=0.05):
    # 阶段二产物：构造 (修订稿 > 草稿) 偏好对，并过滤改进不足的弱样本
    out = []
    for x in prompts:
        y0 = model.generate(x)
        y1, _ = constitutional_revise(model, x, y0, principles)
        if y1 and scorer(x, y1) - scorer(x, y0) > delta:
            out.append({"prompt": x, "chosen": y1, "rejected": y0})
    return out
```

## 五、与其他技术对比

- 宪法 AI vs 纯 RLHF：CAI 更可解释、易审计、人工成本低；但对齐方向完全由原则决定，原则质量即上限。
- 原则式自标注 vs 通用 AI 标注：前者有明确的规范依据，批判与修订可追溯到具体条款；后者更灵活但难以解释。
- SL 阶段（自我修订微调）vs RL 阶段（偏好优化）：SL 阶段简单、先内化能力；RL 阶段进一步提升，但引入偏差传播风险。
- 拒答 vs 原则式拒答：后者要求给出理由与原则编号，便于复核与申诉。

## 六、常见误区

- 「原则越细越好」：过细易冲突、泛化差；过粗则批判空洞，需分层组织并做冲突测试。
- 「模型自评必然更合规」：自偏好会让修订「看起来更好」，必须用独立信号或人工抽检验证。
- 「原则写一次就够」：场景、法规与文化语境变化后原则需更新，应与模型版本一同管理。
- 「CAI 不需要人类」：原论文仍使用少量人类偏好做校准与验证，完全无人类的闭环风险很高。

## 七、与开源书·权威来源对应

- Bai et al. 2022（Constitutional AI）：提出两阶段自批判与自标注范式，是原则式对齐的基础工作。
- Askell et al. 2021：讨论通用语言助手的对齐实验方法，包括有用性与无害性的权衡。
- Lee et al. 2023（RLAIF）：与 CAI 思路互补，提供 AI 反馈在偏好学习中的系统评估。
- HuggingFace Transformers / TRL：可加载对话模型实现角色切换，并用偏好训练器消费自标注数据（接口以官方最新文档为准）。

## 八、面试题

1. 宪法 AI 如何降低人类标注成本？两个阶段各自的作用是什么？
2. 原则集应如何组织与版本化？如何检测原则之间的冲突？
3. 为什么要在批判时随机抽样原则？原则式拒答有哪些工程与合规价值？

## 九、演进与趋势

宪法 AI 正从「人工撰写原则 + 单次自举」走向「可验证原则 + 对抗式测试 + 持续治理」：把原则写成可自动测试的断言，并用红队样本验证模型是否真正遵守；用多轮迭代与人类在环持续修订原则；把原则、批判日志与模型版本一并纳入审计链，使对齐过程可追溯；同时探索跨法域、跨文化的原则集本地化，让同一套技术框架适配不同市场的规范与合规要求。

## 十、小结

宪法 AI 以原则驱动自标注，把价值规范显式化、可审计化，是一条可扩展且可解释的对齐路径。它的上限取决于原则集的质量与治理流程，而非模型规模。
