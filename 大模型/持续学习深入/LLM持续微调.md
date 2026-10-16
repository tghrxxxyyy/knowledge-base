# LLM 持续微调

> 对应 Kirkpatrick et al., *EWC* (PNAS 2017, arXiv:1612.00795)、Lopez-Paz & Ranzato, *Learning without Forgetting* (ECCV 2016, arXiv:1612.00796)、Kemker et al. / De Lange et al. 的持续学习综述，以及 2024 年综述 *Continual Learning of Large Language Models: A Comprehensive Survey* (arXiv:2402.01364)；官方仓库 github.com/huggingface/peft、github.com/huggingface/trl、github.com/meta-llama/llama-recipes、github.com/microsoft/LoRA；关联篇章「持续学习挑战」「灾难性遗忘」「LoRA」「持续预训练」。

## 一、背景与挑战

基座模型上线后不会停在原地：客服机器人要学会每个季度的新产品，代码助手要跟上新语言版本，企业 LLM 要按周注入新的内部文档与合规要求。持续微调（continual fine-tuning）要解决的核心矛盾是：**模型必须不断吸收新领域、新知识，同时不丢失原有能力**——即灾难性遗忘（catastrophic forgetting）与新知识注入速度之间的权衡。

相比传统持续学习，LLM 场景有四个新特点。第一，**底座极强**：基座的通用能力是花数万亿 token 换来的，一次糟糕的垂直微调就能让指令跟随、推理能力明显回退，损失的绝对价值远大于小模型时代。第二，**任务边界模糊**：新旧数据常常混在一起（继续预训练 + 混合 SFT），没有清晰的 task id，回放与隔离策略要能处理「任务流是渐变的」这一事实。第三，**评测昂贵**：每轮微调后要跑通用 benchmark（MMLU、GSM8K、IFEval 等）+ 垂直评测，团队容易只看目标域涨点而忽略回退。第四，**参数高效手段普及**：LoRA/adapter 使「按任务挂载、按需合并」成为主流架构选择，持续学习的实现从算法层面（EWC/GEM）更多转向**工程层面（回放配比 + 适配器隔离）**。

## 二、核心原理

### 2.1 遗忘的机理与 LwF 路线

全参微调的每一步梯度都在把权重往新数据的盆地拉，旧任务的决策边界被覆盖。**Learning without Forgetting (LwF)** 的思路是不存旧数据、用模型自己上一轮的输出当监督：在新任务损失之外，加入对旧任务输入的蒸馏项 $\mathrm{KL}(f_{\theta_{old}}(x_{old}) \| f_{\theta}(x_{old}))$，把旧行为「锚」在参数附近。它的优点是零数据存储，缺点是当新旧输入分布差太远时，旧输入上的蒸馏信号会失效（在完全不相关的输入上，模型输出本身就不可靠）。

### 2.2 正则化路线：EWC 及其变体

**EWC** 认为不是所有参数同等重要：对旧任务损失做二阶泰勒展开，用 Fisher 信息矩阵 $F_i$ 给每个参数加弹簧，重要的参数被罚得更重：

$$\mathcal{L} = \mathcal{L}_{new} + \frac{\lambda}{2}\sum_i F_i (\theta_i - \theta^*_{old,i})^2$$

$F_i$ 近似该参数对旧任务的敏感度。变体有 SI、MAS、online EWC（只维护一份 Fisher 的 EMA，支持真正流式任务）。但 EWC 在 LLM 上实践效果有限：任务数一多， Fisher 对角近似不够用，且每加一个任务就要多存一份锚点参数——所以大规模 LLM 更常用回放 + 正则的混合，纯正则多作为补充。

### 2.3 回放（Replay / Rehearsal）路线

最有效也最工程化：在新数据中混入一小部分旧任务数据（或其高质量代表样本）。关键经验参数：

- **回放比例**：通用 SFT 数据占 5%–20% 常见，防遗忘最稳的区间是 10% 左右；纯继续预训练时混入 1%–10% 通用/旧域语料即可显著止损。
- **回放质量 > 数量**：挑「旧能力的判别性样本」（能暴露回退的 hard case），而不是随机旧样本；可从旧任务评测集里蒸馏出小而精的记忆集。
- **批次内混合**：每 batch 同时含新旧样本，比「先训新、再补旧」交替式更稳（梯度方向不会长时间单边偏置）。
- **数据来源**：旧任务原始数据可留档时直接回放；不可留档（合规）时用旧模型生成伪样本（generative replay），或只回放公开通用语料保住底座能力。

### 2.4 适配器隔离与 LoRA 冻结策略

PEFT 路线下持续学习有三种挂法：(1) **每任务一个 LoRA**，推理时按任务路由或合并，旧能力物理隔离、天然零遗忘，代价是适配器数量增长与路由开销；(2) **共享一个 LoRA 持续追加训练**，简单但仍有遗忘，需配回放；(3) **LoRA + 回放混合**：冻结基座、低秩增量上做带混合数据的持续 SFT——这是目前生产上的默认配方，因为基座不被改动，通用能力的下限由冻结保证，回放只需稳住 LoRA 增量不漂移。

### 2.5 评估与追踪

持续微调必须建立流水线级的追踪：每个「轮次（round）」保存 checkpoint，跑**通用回归组**（MMLU、GSM8K、BBH、IFEval 等）+ **垂直评测组** + **遗忘组**（旧任务评测），用回退幅度 $\Delta_{forget} = \mathrm{Perf}_{round\,k-1} - \mathrm{Perf}_{round\,k}$ 作为一等公民指标；任何一轮垂直涨点但通用回退超阈值（如 2 个点）即回滚并调配比。工具上可用 lm-evaluation-harness 自动化，实验管理记录每轮的数据配比、学习率与回放比例。

## 三、形式化与数学基础

持续学习的序列任务设定：依次学习 $\mathcal{T}_1, \mathcal{T}_2, \dots$，目标是最小化**平均遗忘**：

$$\bar{A}_K = \frac{1}{K}\sum_{j=1}^{K} A_{K,j}, \quad \text{Forget} = \frac{1}{K-1}\sum_{j<K}\left(\max_{k\le K} A_{k,j} - A_{K,j}\right)$$

其中 $A_{k,j}$ 为学完第 $k$ 个任务后在第 $j$ 个任务上的性能。EWC 损失（上文公式的矩阵形式）：

$$\mathcal{L}(\theta) = \mathcal{L}_{new}(\theta) + \frac{\lambda}{2}(\theta - \theta^*_S)^\top F_S (\theta - \theta^*_S)$$

回放混合数据的目标函数是新旧风险的加权和：

$$\min_\theta \; (1-\alpha)\,\mathbb{E}_{(x,y)\sim D_{new}}[\ell] \;+\; \alpha\,\mathbb{E}_{(x,y)\sim D_{replay}}[\ell], \quad \alpha \in [0.05, 0.2]$$

$\alpha$ 是最直接的遗忘旋钮。LwF 的蒸馏项：

$$\mathcal{L} = \ell_{new}(\theta) + \beta\, T^2 \,\mathrm{KL}\!\left(f_{\theta_{old}}(x)/T \,\|\, f_{\theta}(x)/T\right)$$

LoRA 的参数化 $\theta = \theta_0 + BA$（$\theta_0$ 冻结）给出了另一种形式的正则：更新被约束在秩为 $r$ 的子空间内，天然限制对基座能力的破坏体积，可视为「结构化的 EWC」——把无穷维的参数惩罚换成显式的低维子空间约束。

## 四、代码实现

```python
from trl import SFTTrainer, SFTConfig
from peft import LoraConfig
from datasets import concatenate_datasets, Dataset

# ---------- 1) 带回放配比的持续 SFT（生产默认配方） ----------
def build_replay_mix(new_ds: Dataset, replay_pool: Dataset, alpha=0.10):
    """alpha: 回放样本占比。按比例采样旧数据，保证每个 batch 都含旧样本。"""
    n_replay = max(32, int(len(new_ds) * alpha / (1 - alpha)))
    replay = replay_pool.shuffle(seed=42).select(range(min(n_replay, len(replay_pool))))
    mixed = concatenate_datasets([new_ds, replay]).shuffle(seed=42)  # 打散，避免批次单边
    return mixed

def continual_sft(model, train_ds, replay_pool, round_id):
    cfg = SFTConfig(
        output_dir=f"./ckpts/round_{round_id}",
        num_train_epochs=1,
        learning_rate=2e-5,          # 持续微调用小 LR，降低对已有能力的冲击
        per_device_train_batch_size=4,
        report_to="none",
    )
    lora = LoraConfig(r=16, lora_alpha=32, target_modules="all-linear")
    trainer = SFTTrainer(model, args=cfg, train_dataset=build_replay_mix(train_ds, replay_pool), peft_config=lora)
    trainer.train()
    return trainer.model

# ---------- 2) 每任务独立适配器：物理隔离，零遗忘 ----------
def train_adapter_per_task(base_model, task_name, ds):
    from peft import get_peft_model, TaskType
    peft_cfg = LoraConfig(task_type=TaskType.CAUSAL_LM, r=16, lora_alpha=32,
                          inference_mode=False, target_modules="all-linear")
    # 每个任务新建 LoRA 并单独保存；基座权重永不修改
    model = get_peft_model(base_model, peft_cfg)
    ...  # 训练后 model.save_pretrained(f"./adapters/{task_name}")
    return model

# ---------- 3) 通用回归测试：每轮 checkpoint 的防遗忘闸门 ----------
def regression_gate(eval_new, eval_general_prev, eval_general_now, max_drop=2.0):
    """垂直涨点但通用回退超阈值 => 回滚该轮，提高 alpha 或降低 LR 重跑。"""
    drop = eval_general_prev - eval_general_now
    if drop > max_drop:
        return "ROLLBACK"   # 生产上必须有此闸门，否则遗忘只会静默累积
    return "KEEP"

# 经验值：alpha=0.10、epochs=1、LR=1e-5~2e-5 是安全起点；
# 记录每轮的 数据配比 / alpha / LR / 通用分，形成可追溯的持续微调日志。
```

## 五、与其他技术对比

| 方法 | 防遗忘机制 | 需要旧数据 | 每任务开销 | LLM 上的实际效果 | 典型坑 |
|------|-----------|-----------|-----------|------------------|--------|
| 朴素继续微调（无防护） | 无 | 否 | 零 | 必然遗忘，通用能力回退 | 「目标域涨点」掩盖全局退化 |
| LwF / 自蒸馏 | 输出层锚定旧行为 | 否（用旧模型） | 需保存旧模型 | 中，分布偏移大时失效 | 旧输入缺失时蒸馏信号失真 |
| 回放 / Replay | 混合风险直接优化 | 是（或伪样本） | 低（只调配比） | **最稳，工程首选** | 回放质量差则治标不治本 |
| EWC / Fisher 正则 | 参数弹簧惩罚 | 否（存 Fisher） | 存锚点 + Fisher | LLM 上偏弱、任务多失效 | 对角近似不足，λ 难调 |
| 每任务 LoRA 隔离 | 物理不修改基座 | 否 | 适配器存储+路由 | 零遗忘但管理复杂 | 适配器膨胀、路由错误 |
| LoRA 冻结基座 + 回放 | 子空间约束 + 混合风险 | 部分 | 低 | **生产默认配方** | r 过小限制新知识容量 |

## 六、常见误区

1. **「反复 SFT 同一模型不会退化」**：会。多次小规模 SFT 的误差累积等效于把模型反复拉向不同盆地，通用 benchmark 会逐轮阴跌；每轮都必须跑回归测试。
2. **「回放比例越高越好」**：$\alpha$ 过大时新知识吸收变慢、两边都不讨好；超过 20% 通常开始挤占新任务的拟合预算。正确做法是把 $\alpha$ 当作遗忘/学习的权衡旋钮做小规模扫描。
3. **「LoRA 冻结基座 = 零遗忘」**：冻结的只是 $\theta_0$，推理时若合并 LoRA 或与其他适配器叠加，输出行为照样漂移；且共享 LoRA 持续训练同样会遗忘。隔离必须体现在「按任务挂载与路由」的完整链路上。
4. **「EWC 是 LLM 防遗忘的银弹」**：EWC 的对角 Fisher 近似在十亿参数、几十个任务下力不从心，实践中多作为辅助项而非主防线；LLM 的主力是回放 + PEFT 隔离。
5. **「只要目标域评测涨了，这轮微调就是成功的」**：必须同时看通用回归组与旧任务遗忘组，否则会出现「金融问答涨 3 点、指令跟随掉 8 点」的净亏损。
6. **「继续预训练和持续 SFT 是一回事」**：继续预训练改的是知识注入（raw text loss），SFT 改的是行为对齐（instruction loss）；混用配比与学习率策略不同，遗忘形态也不同（前者忘知识、后者忘格式与指令跟随）。

## 七、与开源书·权威来源对应

- 持续学习综述：De Lange et al., *A Continual Learning Survey* (TPAMI)；LLM 专项综述 arXiv:2402.01364 *Continual Learning of Large Language Models: A Comprehensive Survey*
- EWC：Kirkpatrick et al., arXiv:1612.00795；LwF：Lopez-Paz & Ranzato, arXiv:1612.00796；GEM（梯度 episodic memory）：arXiv:1706.08840
- PEFT 实现：https://github.com/huggingface/peft （LoRA/适配器的保存、合并与多适配器加载）
- SFT/配比实验：https://github.com/huggingface/trl
- 持续预训练参考实现：https://github.com/meta-llama/llama-recipes （含继续预训练与混合数据示例）
- LoRA 原始仓库：https://github.com/microsoft/LoRA
- 开源课程：https://github.com/mlabonne/llm-course
- 本知识库关联篇章：「持续学习挑战」「灾难性遗忘」「LoRA 原理」「持续预训练」「数据配比」

## 八、面试题

1. **LLM 持续微调中灾难性遗忘的典型信号是什么？怎么系统性检测？**
   要点：通用 benchmark（MMLU/GSM8K/IFEval）逐轮回退、旧任务评测下跌、生成格式劣化；系统方案是每轮 checkpoint + 通用回归组 + 遗忘组三线评测，用 $\Delta_{forget}$ 作为一等指标，超阈值回滚。
2. **回放数据的配比怎么定？有哪些实操经验？**
   要点：起步 10% 左右，扫描 5%–20%；批次内混合而非先后交替；质量优先（旧能力的判别性样本 / 通用强基线数据）；合规无法留档时用 generative replay 或只回放公开语料。
3. **EWC 和回放的原理区别？为什么 LLM 上更常用回放？**
   要点：EWC 用 Fisher 加参数弹簧（正则化、免存数据），回放直接优化混合风险（经验风险层面更硬）；LLM 任务多、Fisher 对角近似失效且锚点累积，而回放只需配比调参、效果立竿见影。
4. **LoRA 持续微调有哪几种挂载策略？各自取舍？**
   要点：每任务独立适配器（零遗忘、有路由/存储开销）、共享 LoRA 续训（简单但需回放）、冻结基座 + 回放微调增量（生产默认）；强调隔离要覆盖推理端的合并与路由链路。
5. **一次持续微调「轮次」的完整工程流程是什么？**
   要点：选新数据 + 混回放 → 小 LR 单 epoch 训练 → 保存 checkpoint → 跑通用/垂直/遗忘三组评测 → 对比上一轮回归 → 达标上线、不达标调 $\alpha$/LR 重跑 → 记录配比与指标日志。
6. **LwF 在什么情况下会失效？**
   要点：新旧输入分布差异过大时，旧输入上的教师输出不可靠，蒸馏项反而误导；且没有真实旧数据，无法纠正教师自身的偏差，因此常与少量回放互补使用。

## 九、演进与趋势

持续学习的算法史大致三段：2010s 前期以**正则化**（EWC、SI、MAS）与**回放/内存库**（GEM、A-GEM）为主流，解决小模型多任务流；2017-2022 年**参数隔离**（PackNet、Progressive Nets）与动态扩容被系统研究，但工程复杂度高、未普及。LLM 时代范式明显收敛：**PEFT（LoRA/adapter）+ 数据回放 + 评测闸门**成为三件套，正则化方法退居辅助。2023-2024 年的活跃方向包括：持续预训练的领域流（domain-incremental）建模与数据配比优化、generative replay 用旧模型造旧任务样本（隐私合规场景）、多适配器的自动路由与合并（避免人工选 adapter）、以及把遗忘评测并入 CI/CD（每轮微调自动触发回归测试）。更远期的趋势是把「持续学习」从单独算法变成**训练平台的基础能力**：数据版本化、评测版本化、模型版本化三线联动，让「模型越用越新且不退化」成为可运营的 SLO 而不是一次性调参结果。

## 十、小结

LLM 持续微调 = **新知识注入** 与 **旧能力保全** 的联合优化。原理层面，遗忘来自新任务梯度对旧盆地的覆盖，LwF 用蒸馏锚定行为、EWC 用 Fisher 弹簧锚定参数、回放用混合风险直接平衡、LoRA 用低维子空间限制破坏半径；工程层面，回放配比（约 10%）、小学习率、单 epoch、冻结基座 + LoRA 是经过大量生产验证的默认配方，而通用 + 垂直 + 遗忘三线评测与回滚闸门是防止遗忘静默累积的最后防线。记住两条硬规则：**没有回归测试的持续微调等于慢性自毁；回放不是可选项，而是持续微调的免疫系统**。
