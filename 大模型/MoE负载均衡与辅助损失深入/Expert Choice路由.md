# Expert Choice路由

> 对应 Zhou et al., 2022 *Mixture-of-Experts with Expert Choice Routing*。

## 一、背景与挑战
传统路由是 token 选专家，导致负载不均。Expert Choice 反过来：每个专家选 top-k 个 token。

## 二、核心原理
路由网络给出 token-expert 分数矩阵 $S \in \mathbb{R}^{B \times N}$，每个专家选 top-k 个 token 处理：$E_i = \text{top-k}_x(S_{x,i})$。天然保证每个专家处理相同数量的 token。

## 三、形式化与数学基础
$ B = L \cdot B_\text{batch} $ tokens, $N$ 专家，每个专家选 $k = B/N$ 个 token（完美均衡）。损失：标准 CE + 可选负载正则。

## 四、代码实现
```python
# Expert Choice
scores = gate(x)  # (B, N)
# 每个专家选 top-k
expert_choice = scores.topk(k=B//N, dim=0)  # (k, N)
# 处理
out = torch.zeros_like(x)
for i in range(N):
    tokens = expert_choice.indices[:, i]
    out[tokens] += expert_expert[i](x[tokens])
```

## 五、与其他技术对比
- vs Token Choice：天然均衡但可能忽略重要 token。
- vs Switch (k=1)：Switch 不均衡，Expert Choice 均衡。

## 六、常见误区
- 专家数量 $N$ 与 batch 关系：$B$ 应整除 $N$。
- padding token 干扰路由时需 mask。

## 七、与开源书/权威来源对应
- google-research/expert-choice 论文。
- d2l-ai/d2l-zh。

## 八、面试题
- Expert Choice 如何保证均衡？答：每个专家选相同数量 token。

## 九、演进与趋势
Token Choice → Expert Choice → 混合（DeepSeek-MoE）。

## 十、小结
Expert Choice 是无辅助损失均衡的代表方案。
