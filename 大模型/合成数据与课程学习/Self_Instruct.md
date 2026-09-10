# Self-Instruct

> 对应 Wang et al. (2022) Self-Instruct: Aligning Language Models with Self-Generated Instructions; Stanford Alpaca (Taori et al., 2023)。

## 一、背景与挑战

指令微调（Instruction Tuning）是让基座语言模型理解并遵循人类指令的关键一步，但其前提是拥有大量高质量「(指令, 输入, 输出)」三元组。传统做法依赖人工标注，存在三个难以回避的问题：第一，成本高昂，规模化标注需要大量人力与时间；第二，覆盖有限，人工很难穷尽任务的多样性与长尾分布；第三，口径不一致，不同标注者的风格与质量标准难以统一。

Self-Instruct 的核心洞察是：强大的语言模型本身已经具备一定的指令遵循与生成能力，可以用「少量种子指令」引导模型自举（bootstrap）出海量新指令与对应回答，再经过滤后用于监督微调（SFT）。这一范式被 Stanford Alpaca 直接采用，仅用 52K 条由 text-davinci-003 生成的指令数据，就将一个 7B LLaMA 模型对齐到了接近 ChatGPT 的交互水平，极大降低了指令数据的获取门槛。

## 二、核心原理

Self-Instruct 是一个迭代式自举流水线，主要包含四个阶段：

1. **指令生成（Instruction Generation）**：从种子任务池中随机抽取少量指令作为示范，要求模型生成一批全新的、多样化的指令。
2. **任务分类识别（Classification Identification）**：判断新指令是否属于分类任务，因为分类任务的实例生成需要输出固定标签集合。
3. **实例生成（Instance Generation）**：根据指令生成具体的「输入-输出」对，分类任务给出标签空间再采样，非分类任务直接生成。
4. **过滤与后处理（Filtering）**：通过启发式规则与去重，剔除低质量、重复或格式异常的样本，合格样本回灌任务池，进入下一轮迭代。

该方法的关键在于「模型既是教师也是学生」：用模型生成的数据反过来训练更强的模型，形成数据飞轮。

## 三、形式化与数学基础

设任务池为 $T$，种子集为 $T_{seed} \subset T$。每一轮从 $T$ 中抽取 $K$ 个示范指令 $S = \{t_1, \dots, t_K\}$，以提示词驱动模型采样新指令 $t_{new} \sim p_\theta(\cdot \mid S, \text{meta-prompt})$。实例生成为 $x, y \sim p_\theta(\cdot \mid t_{new})$。

去重常用 ROUGE-L 相似度阈值过滤：

$$
\text{keep}(t_{new}) = \mathbb{1}\left[ \max_{t \in T} \text{ROUGE-L}(t_{new}, t) < \tau \right]
$$

其中 $\tau$ 为相似度上限（原文取 0.7）。长度与关键词启发式进一步约束：指令长度需落在 $[L_{min}, L_{max}]$ 区间，且不含无效占位符。

## 四、代码实现

下面给出生成阶段的精简伪代码骨架：

```python
def self_instruct_step(model, pool, k=8, rouge_thr=0.7):
    seed = random.sample(pool, k)          # 抽取示范
    new_instr = model.generate_instruct(seed)   # 生成新指令
    if max_rouge(new_instr, pool) >= rouge_thr:
        return None                        # 去重淘汰
    is_cls = model.classify_task(new_instr)    # 是否分类任务
    if is_cls:
        labels = model.gen_labels(new_instr)
        x, y = model.gen_instance_cls(new_instr, labels)
    else:
        x, y = model.gen_instance(new_instr)
    return {"instruction": new_instr, "input": x, "output": y}
```

实际工程中还需加入长度裁剪、空输出丢弃与并行采样提升吞吐。

## 五、与其他技术对比

| 方法 | 数据来源 | 多样性 | 成本 | 典型产物 |
|------|----------|--------|------|----------|
| 人工标注 | 人类专家 | 中 | 极高 | 高质量但有限 |
| Self-Instruct | 模型自举 | 较高 | 低 | Alpaca 52K |
| Evol-Instruct | 模型迭代进化 | 高 | 低 | WizardLM |
| 蒸馏 | 强教师直答 | 取决于教师 | 中 | 各 Chat 模型 |

Self-Instruct 胜在低门槛、可自举，缺点是生成的指令分布受初始种子与基础模型能力天花板约束。

## 六、常见误区

- **「生成越多越好」**：不做去重与质量过滤会引入大量同质、占位与幻觉样本，反而损害 SFT 效果。
- **「种子可以很少」**：种子多样性直接决定生成空间，种子过窄会导致指令退化到少数模板。
- **「可直接用于对齐」**：Self-Instruct 产出的是指令遵循数据，仍需配合指令质量筛选（见「指令数据质量」）与对齐手段。
- **混淆生成与验证**：仅生成不校验会在数据集中埋入错误标签，后续需拒绝采样等机制补强。

## 七、与开源书·权威来源对应

- Wang et al., *Self-Instruct: Aligning Language Models with Self-Generated Instructions*, 2022（NeurIPS）。
- Taori et al., *Stanford Alpaca*, 2023（github.com/tatsu-lab/stanford_alpaca）。
- mlabonne 的 llm-course 将 Self-Instruct 列为指令数据合成的基础范式。

## 八、面试题

1. Self-Instruct 如何避免生成数据的同质化与退化？
2. 为什么需要用 ROUGE 相似度而非简单精确匹配做去重？
3. 分类任务与非分类任务在实例生成阶段有何差异？
4. Self-Instruct 的数据天花板由什么决定？如何突破？

## 九、演进与趋势

Self-Instruct 之后，指令自举范式快速演进：WizardLM 的 Evol-Instruct 通过「指令进化」（深度/广度扩展）产出更难、更复杂的指令；自博弈（Self-Play）让模型在生成与判别之间互搏提升质量；指令回放与拒绝采样结合，进一步提升信噪比。当前主流做法是把 Self-Instruct 作为冷启动数据池，再叠加质量过滤与对抗式筛选。

## 十、小结

Self-Instruct 用「模型教模型」的自举思路，将指令数据的获取成本数量级降低，是开源指令微调浪潮的起点。其价值不在单条样本质量，而在可规模化、可迭代的数据飞轮；落地时务必配齐去重、分类识别与质量过滤三道防线。
