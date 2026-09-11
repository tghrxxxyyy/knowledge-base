# 主流 MoE 模型

> 对应 Jiang et al., *Mixtral of Experts*, 2024 与 DeepSeek-AI, *DeepSeekMoE*, 2024，综述见 Fedus et al., *Switch Transformers*, 2022。

## 一、背景与挑战

稠密模型扩展受限于「参数量与单次推理算力同步增长」。MoE 通过稀疏激活把二者解耦，使得「总参数量巨大、单次激活参数量小」成为现实。

近年的开源大模型（Mixtral、DeepSeek 系列、Qwen-MoE 等）纷纷采用 MoE，验证了其在同等训练预算下获得更强能力、并在推理时保持较低激活成本的可行性。

理解这些主流架构的差异，是选型与微调的基础。MoE 之所以能成为开源主流，还因为它与现有 Transformer 训练栈兼容：只需把 FFN 替换为专家层，其余注意力、位置编码、词表几乎不变。

因此可在 Megatron / DeepSpeed 等框架上平滑落地，复用数学、数据、并行基建，降低工程门槛。

## 二、核心原理

主流 MoE 模型在「专家粒度」与「是否设共享专家」上各不相同：

- **Switch / GShard**（基础形态）：每层 $N$ 个专家，top-1 或 top-2 路由，强调简单与均衡。
- **Mixtral 8x7B**：8 个专家，每 token 选 2 个；总参约 46.7B，但每次前向仅激活约 12.9B（两张专家卡 + 共享注意力/嵌入）。
- **DeepSeekMoE**：引入「细粒度专家分割」与「共享专家」（shared expert），把通用知识放进常激活的共享专家，路由专家更专注于差异化能力。
- **Qwen-MoE / GLM-MoE**：延续细粒度 + 共享专家思路，并把 MoE 扩展到多语言与长上下文场景。

共享专家的价值在于：它承担跨任务通用表示，使路由专家不必重复学习基础知识，从而提升专精度与知识隔离。

## 三、形式化与数学基础

设每层有 $E$ 个路由专家，每 token 激活 $k$ 个，权重为门控 $g_i(x)$。输出为：

$$ y = \sum_{i \in topk(g(x), k)} g_i(x) \cdot E_i(x) $$

若引入 $s$ 个共享专家 $S_j$，则：

$$ y = \sum_{j=1}^{s} S_j(x) + \sum_{i \in topk} g_i(x) \cdot E_i(x) $$

激活参数量近似为：

$$ P_{active} \approx P_{shared} + \frac{k}{E} \cdot P_{routed} + P_{其他} $$

Mixtral 中 $\frac{k}{E} = \frac{2}{8} = 0.25$，故路由部分仅用约 1/4 参数。

DeepSeekMoE 因细粒度分割，$E$ 更大、$k/E$ 更小，激活比例进一步下降而总参更大，质量上限更高。

## 四、代码实现

```python
# 以 HuggingFace 加载 Mixtral 为例，观察其专家结构
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("mistralai/Mixtral-8x7B-v0.1")
# 打印某一层专家数（具体字段名以官方最新文档为准）
for name, module in model.named_modules():
    if "block_sparse_moe" in name:
        print(name, "num_experts=", getattr(module, "num_experts", None))
        print("experts_per_tok=", getattr(module, "experts_per_tok", None))
        break

# 估算激活参数：仅统计被路由到的专家权重（示意）
def count_active_params(model, k):
    routed = sum(p.numel() for p in model.parameters())  # 简化：实际需区分
    return routed * k / 8  # Mixtral 近似
```

## 五、与其他技术对比

| 模型 | 专家数 / 激活 | 共享专家 | 特点 |
| --- | --- | --- | --- |
| Switch | 多 / top-1 | 无 | 简单、均衡优先 |
| Mixtral 8x7B | 8 / top-2 | 无 | 开源标杆，激活约 13B |
| DeepSeekMoE | 细粒度 / top-k | 有 | 专家专精、知识隔离好 |
| 稠密模型 | 无 | 无 | 激活 = 总参，推理贵 |

从对比可见：共享专家是近年主流 MoE 的关键进化点，它把「通用」与「专用」解耦，是质量提升的主因之一。

## 六、常见误区

- 认为 8x7B 等于 56B 激活：实际仅激活约 13B（2/8 路由专家 + 共享组件），参数量与激活量需区分。
- 认为专家数越多越好：专家过多会加剧路由不均衡与通信开销，且需要更大数据量才能训好。
- 认为 MoE 推理一定便宜：显存仍需容纳全部专家权重，显存占用接近总参数量。
- 认为专家会自动语义分工：需负载均衡与训练策略引导，否则易塌缩成少数专家。

## 七、与开源书·权威来源对应

- Jiang et al., *Mixtral of Experts*, 2024：8 专家选 2 的公开权重实践。
- DeepSeek-AI, *DeepSeekMoE*, 2024：细粒度专家与共享专家设计。
- Fedus et al., *Switch Transformers*, 2022：MoE 综述与容量/负载均衡基础。

## 八、面试题

- Mixtral 8x7B 实际激活多少参数？答：约 12.9B，因每 token 仅激活 2/8 路由专家。
- 共享专家的作用？答：承载通用、跨任务知识，减少路由专家负担，提升专精度。
- 为何 DeepSeekMoE 要细粒度分割？答：更细的路由粒度提升专家专精度与知识隔离，降低专家间冗余。
- MoE 与稠密如何取舍？答：同算力下 MoE 总参更大、质量更高，但显存与通信成本更高。

## 九、演进与趋势

粗粒度 top-k → 细粒度 + 共享专家 → expert-choice 路由（专家选 token，零丢弃）。多模态与长上下文下的 MoE 化（如视觉专家、语言专家分离）也是活跃方向。

端到端可微路由进一步释放专家潜力：让门控与专家协同优化，而非固定路由规则。模型规模上，MoE 正从 7B-70B 走向数百 B 总参、激活仍可控的「廉价大模型」范式。

## 十、小结

主流 MoE 模型以「稀疏激活 + 共享专家」为核心范式，在开源生态中已成为与稠密模型并列的主流路线；选型时需权衡激活成本、显存与路由均衡，并按真实激活参数量评估推理预算，而非被总参数字误导。
