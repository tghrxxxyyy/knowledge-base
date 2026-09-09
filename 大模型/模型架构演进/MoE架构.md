# 混合专家 MoE

> 对应 Shazeer et al., *Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer*, 2017；Jiang et al., *Mixtral of Experts*, 2024。

## 一、背景与挑战

「扩展定律」表明模型参数量与性能强相关，但稠密模型每增一参数都需等量算力。当参数迈向千亿、万亿级，训练与推理成本不可承受。核心矛盾是：**我们想拥有大模型的「知识容量」，却只想付出小模型「每 token」的算力**。

混合专家（Mixture-of-Experts, MoE）通过「把参数拆成多份专家，每个 token 只激活其中少数几份」破解该矛盾：总参数量（容量）很大，但实际前向计算只用到一部分（算力恒定），实现「以算力换参数」的解耦。

## 二、核心原理

MoE 层把标准前馈网络（FFN）替换为 $K$ 个专家网络 $\{E_1,\dots,E_K\}$ 与一个路由网络（router / gating）。给定 token 表示 $x$，路由器先算各专家得分再取 top-$k$（通常 $k=1$ 或 $2$），仅被选中专家参与计算，最后用门控权重加权求和：

$$
g = \text{softmax}(W_r x), \qquad y = \sum_{i\in \text{top-}k(g)} g_i\,E_i(x)
$$

这样每个 token 走不同「专家路径」，模型在固定计算预算下容纳更多参数。训练时通过反向传播同时更新专家与路由；推理时每 token 仅激活约 $k/K$ 的 FFN 计算量。

## 三、形式化与数学基础

设路由 logits $r_i = (W_r x)_i$，归一化门控：

$$
g_i = \frac{\exp(r_i)}{\sum_{j=1}^{K}\exp(r_j)}
$$

取集合 $\mathcal{T} = \text{TopK}(g, k)$，输出为：

$$
y = \sum_{i\in \mathcal{T}} g_i\,E_i(x), \qquad \text{其中 } E_i(x)=W_{i,2}\,\phi(W_{i,1}x)
$$

为缓解路由失衡（少数专家被反复选中、多数饿死），常加**负载均衡损失**（load balancing loss）：

$$
\mathcal{L}_{\text{aux}} = \alpha \cdot K \sum_{i=1}^{K} f_i \cdot P_i, \quad f_i=\text{被分到专家}i\text{的token占比},\; P_i=\text{路由给}i\text{的平均概率}
$$

系数 $\alpha$ 小（如 $10^{-2}$），仅作辅助约束。

## 四、代码实现

用 HuggingFace `transformers` 加载 MoE 模型并观察激活专家：

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model = AutoModelForCausalLM.from_pretrained("mistralai/Mixtral-8x7B-v0.1")
tok = AutoTokenizer.from_pretrained("mistralai/Mixtral-8x7B-v0.1")

ids = tok("深度学习改变了世界", return_tensors="pt")
# 注册钩子查看每层路由分配（示意）
with torch.no_grad():
    out = model(**ids, output_router_logits=True)
router_logits = out.router_logits          # 每层 [batch, seq, num_experts]
expert_weights, expert_idx = torch.topk(router_logits[0].softmax(-1), k=2)
print("每 token 选中的 top-2 专家:", expert_idx)
```

## 五、与其他技术对比

| 维度 | 稠密模型 | MoE |
|------|----------|-----|
| 总参数量 | 全激活 | 大（多专家） |
| 每 token 算力 | 全用 | 仅 top-k |
| 训练稳定性 | 稳 | 路由失衡、负载不均 |
| 显存占用 | 参数 + 激活 | 需常驻全部专家参数 |
| 推理吞吐 | 线性 | 高（算力省） |

注意 MoE 的「省算力」主要体现在训练与前向 FLOPs，但**全部专家参数须常驻显存**，故对「内存带宽/容量」敏感，对「纯计算量」友好。

## 六、常见误区

- 「MoE 推理显存更小」：错误，全部专家权重仍在显存，省的是计算不是存储；除非做专家卸载/路由到不同设备。
- 「top-1 一定比 top-2 好」：不一定，top-2 常提升质量，代价是约翻倍激活计算。
- 「路由可以随意学」：无负载均衡约束会导致坍缩（少数专家接管），需 aux loss 或 routing 正则。
- 「MoE 等于模型蒸馏/集成」：不同，MoE 是条件计算（conditional compute），集成是独立模型投票。

## 七、与开源书·权威来源对应

- Shazeer et al., *Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer*, 2017。
- Jiang et al., *Mixtral of Experts*, 2024（8×7B、top-2 路由）。
- Fedus et al., *Switch Transformers*, 2021（top-1、极致稀疏）。
- llm-course「Model optimization」与 HuggingFace 文档 MoE 章节。

## 八、面试题

- MoE 为何能在不增加每 token 算力的情况下扩大参数量？
- 负载均衡损失（auxiliary loss）在解决什么问题？去掉会怎样？
- MoE 训练显存为何仍很大？与稠密模型相比省了什么、没省什么？
- top-1 与 top-2 路由在质量与效率上的权衡？

## 九、演进与趋势

从 Shazeer 的稀疏门控 MoE，到 GShard / Switch Transformers 把专家扩展到超大规模与 top-1 极致稀疏，再到 Mixtral（8×7B、细粒度专家）、DeepSeekMoE（更细专家划分 + 共享专家）、Qwen-MoE 等开源落地。趋势包括：更细粒度专家、共享专家（shared expert）吸收通用知识、路由与通信优化（专家并行）、以及把 MoE 用于注意力层（fine-grained MoE attention）。推理侧则结合「专家并行 + 量化」压缩显存占用。

## 十、小结

MoE 用「条件计算」把参数规模与每 token 计算解耦，是规模化最经济的技术路线之一：以常驻显存换训练/推理 FLOPs 的节省。其工程核心在路由均衡与专家并行的系统优化，挑战是负载失衡与部署复杂。最新细节（专家数、路由策略、开源权重）以官方论文与 HuggingFace 文档为准。
