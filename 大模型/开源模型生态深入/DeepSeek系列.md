# DeepSeek 系列

> 对应 DeepSeek 官方技术报告（DeepSeek LLM / V2 / V3 / R1，版本与规格以官方最新文档为准）与 Vaswani et al. 2017《Attention Is All You Need》。

## 一、背景与挑战

行业曾长期默认"能力领先 = 训练投入巨大"，这把大多数团队挡在门外：不仅预训练昂贵，长上下文推理的显存与带宽成本也随用户量线性膨胀。DeepSeek 同时从两个方向动刀——训练侧用 MoE 与工程优化压低单位能力成本；推理侧用 MLA（多头潜在注意力）把 KV 缓存压到极低。

挑战同样明显：MoE 的路由稳定性与负载均衡需精细设计；MLA 的低秩压缩可能损失信息，需以指标验证；强化学习驱动的推理模型输出更长、更不稳定；蒸馏小模型继承的是"行为"而非"能力边界"，分布外退化更快。理解这些取舍比记住版本号重要。

## 二、核心原理

第一层是 **MoE**：把 FFN 换成若干专家，每个 token 只激活 top-k 个，$\mathrm{MoE}(x) = \sum_{i \in \mathrm{TopK}(g(x))} g_i(x) E_i(x)$。总参数可以很大（容量大），激活参数与计算量远小于总参数（成本低），通常还需辅助负载均衡损失与共享专家。

第二层是 **MLA**：先把输入低秩压缩成潜在向量 $c^{KV}_t = W^{DKV} h_t$，推理时只缓存它，再重建 $k_t = W^{UK} c^{KV}_t$、$v_t = W^{UV} c^{KV}_t$。由于 $d_c \ll H d_h$，缓存量与头数解耦。

第三层是 **推理模型的强化学习**：R1 一类工作用 GRPO 式的组内相对优势优化可验证奖励（数学正确、代码通过测试），让长链思考与自我检查自发涌现，再蒸馏进小模型实现能力下放。

## 三、形式化与数学基础

MoE 的辅助负载均衡损失为 $\mathcal{L}_{\mathrm{aux}} = \alpha N_e \sum_i f_i P_i$，其中 $f_i$ 为路由到专家 $i$ 的 token 比例，$P_i$ 为路由概率均值；该项鼓励分布均匀，避免专家饥饿与路由塌缩。

MLA 的缓存节省比：MHA 每 token 缓存 $2Hd_h$ 个标量，MLA 只缓存 $d_c$，故

$$
\frac{M^{\mathrm{MLA}}_{\mathrm{kv}}}{M^{\mathrm{MHA}}_{\mathrm{kv}}} = \frac{d_c}{2 H d_h}
$$

这是它与 GQA 的根本区别：GQA 是"减少头数"，MLA 是"压缩表示"。

GRPO 去掉 critic，用组内相对优势作基线。对同一问题采样 $G$ 个答案，奖励为 $\{r_i\}$，则

$$
\hat{A}_i = \frac{r_i - \mathrm{mean}(\{r_1,\dots,r_G\})}{\mathrm{std}(\{r_1,\dots,r_G\})}
$$

策略梯度目标为最大化带 clip 的替代目标：

$$
\mathcal{J}(\theta) = \mathbb{E}\left[ \frac{1}{G}\sum_{i=1}^{G} \min\left( \frac{\pi_\theta(o_i|q)}{\pi_{\mathrm{old}}(o_i|q)} \hat{A}_i,\ \mathrm{clip}\left(\frac{\pi_\theta(o_i|q)}{\pi_{\mathrm{old}}(o_i|q)}, 1-\epsilon, 1+\epsilon\right) \hat{A}_i \right) \right]
$$

省掉与策略同等规模的价值网络，显存与工程复杂度都下降。

## 四、代码实现

```python
# 加载 DeepSeek 蒸馏推理模型；思考链会显著拉长输出
import re
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"
tok = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, torch_dtype=torch.bfloat16, device_map="auto")

q = "甲管单独 6 小时注满水池，乙管单独 4 小时注满，两管齐开几小时注满？"
prompt = tok.apply_chat_template([{"role": "user", "content": q}],
                                 tokenize=False, add_generation_prompt=True)
batch = tok(prompt, return_tensors="pt").to(model.device)

with torch.inference_mode():
    out = model.generate(**batch, max_new_tokens=2048, do_sample=False)
    # 预算给得太小会截断思考链，表现为"模型突然变笨"

text = tok.decode(out[0][batch["input_ids"].shape[-1]:], skip_special_tokens=True)

# 拆分思考段与答案段：<think> 内为推理过程，之后为最终答案
m = re.search(r"<think>(.*?)</think>", text, flags=re.DOTALL)
answer = text[m.end():].strip() if m else text
print("思考长度:", len(m.group(1)) if m else 0, "| 答案:", answer)
```

## 五、与其他技术对比

| 维度 | MLA | MHA | GQA | MQA |
|------|-----|-----|-----|-----|
| KV 缓存 | 极低（缓存潜在向量） | 高 | 中（1/g） | 低（1/H） |
| 表达能力 | 靠低秩重建，需验证 | 最强 | 接近 MHA | 较弱 |
| 实现复杂度 | 高 | 低 | 低 | 低 |
| 长上下文成本 | 最优 | 最差 | 较好 | 好 |

| 维度 | MoE | 稠密模型 |
|------|-----|----------|
| 总参/激活参数 | 分离，容量大而计算小 | 相等 |
| 权重显存 | 高，需装下所有专家 | 低 |
| 大批量吞吐 | 高 | 低 |
| 训练稳定性 | 需负载均衡调优 | 稳定 |
| 部署复杂度 | 高（专家并行） | 低 |

## 六、常见误区

- **把 MoE 总参数当计算量**：Mixtral 8x7B 不是 56B 的计算量，但显存确实要装下全部专家。
- **认为 MLA 无损**：低秩压缩是有损的，应以任务指标而非直觉判断。
- **把推理模型当通用模型**：简单任务上长思考是浪费，成本可能高数倍。
- **max_new_tokens 给太小**：截断思考链会让正确率断崖下降。
- **认为蒸馏继承全部能力**：蒸馏迁移的是行为分布，分布外退化更快。

## 七、与开源书·权威来源对应

- DeepSeek-AI 官方技术报告（LLM / V2 / V3 / R1）：MLA、MoE 与 GRPO 的一手来源，数字以官方最新文档为准。
- Shazeer et al. 2017《Sparsely-Gated MoE》与 Fedus et al. 2021《Switch Transformers》：稀疏 MoE 的奠基与大规模实践。
- Vaswani et al. 2017 与 Ainslie et al. 2023《GQA》：MHA 基线与另一条 KV 压缩路线。
- Shao et al. 2024《DeepSeekMath》：GRPO 的提出出处，R1 类推理模型的训练方法基础。
- Ouyang et al. 2022（InstructGPT）与 Rafailov et al. 2023（DPO）：用于理解 RLHF 与直接对齐的路线差异。

## 八、面试题

1. MLA 与 GQA 降低 KV 缓存的思路有何不同？各自代价是什么？
2. MoE 的总参数、激活参数、显存、计算量四者是什么关系？
3. 为什么 MoE 需要辅助负载均衡损失？它具体惩罚什么？
4. GRPO 相比 PPO 去掉了什么？用组内均值做基线的含义是什么？

## 九、演进与趋势

路线是 V1 建立基座 → V2 引入 MLA 与 MoE 重塑成本结构 → V3 推进工程与规模 → R1 用大规模 RL 把推理能力推到前沿并开源蒸馏版。趋势上：成本结构竞争成为主线，架构创新直接服务单位 token 成本；可验证奖励的 RL 从数学/代码扩展到更多可自动判分领域；推理时算力换质量成为新旋钮；蒸馏让强推理能力下沉到端侧。

## 十、小结

DeepSeek 的贡献是把"能力/成本"比值作为架构与训练的第一目标：MLA 解决长上下文显存瓶颈，MoE 解耦容量与计算，GRPO 解决可验证任务的自我提升。理解它需要同时看懂缓存公式、路由负载均衡与组内相对优势这三组数学。落地时按官方报告核对规格，并在自有任务上复测长思考的性价比。
