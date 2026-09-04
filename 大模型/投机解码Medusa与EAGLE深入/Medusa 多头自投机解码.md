# Medusa 多头自投机解码

> 对应 Cai 2024 Medusa; Leviathan 2023 speculative decoding; Touvron 2023 LLaMA。

## 一、背景与挑战
独立草稿模型需额外参数与显存，且分布差距导致接受率低。Medusa 提出在冻结主干上挂多个解码头，让一个前向同时产出多个未来位置的候选。

## 二、核心原理
Medusa 为每个前瞻位置 k 训练一个独立 head，预测位置 t+k 的 token。多个 head 输出多个候选，组合成若干假设路径，目标模型一次验证所有路径，按树状接受最大化接受长度。

## 三、形式化与数学基础
第 k 个 Medusa head 的损失：
$ \mathcal{L}_k = -\log P_\theta(x_{t+k} \mid h_t, \text{medusa}_k) $
整体为各 head 损失之和。验证阶段对树中叶节点做自顶向下接受，保证与 target 分布一致。

## 四、代码实现
```python
class MedusaHead(nn.Module):
    def __init__(self, dim, vocab):
        self.lin = nn.Linear(dim, vocab)
    def forward(self, h):
        return self.lin(h)            # 预测位置 t+k 的 token

def medusa_propose(hidden, heads, topk=5):
    candidates = []
    for head in heads:
        candidates.append(head(hidden).topk(topk).indices)
    return candidates                 # 每个 head 一组候选
```

## 五、与其他技术对比
相比 EAGLE 用自回归特征递归，Medusa 直接基于当前隐状态并行预测，结构更简单但候选更“宽”而浅，树深度有限。

## 六、常见误区
误区：Medusa head 越多越好。实际 head 数受训练成本与接受率边际递减限制，通常 1-4 个头收益最佳。

## 七、与开源书/权威来源对应
Cai et al. 2024 Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads。参考 facebookresearch/llama、vllm-project/vllm。

## 八、面试题
问：Medusa 如何保证生成分布无偏？
答：所有候选经目标模型 logits 验证并做修正重采样，拒绝分支按 target 重采，分布等价。

## 九、演进与趋势
Medusa-2 将主干也微调解锁更高接受率；与投机采样、树状验证结合成为工业级标配。

## 十、小结
Medusa 以多头并行候选把投机解码轻量化，是“自投机”最早落地方案之一，工程友好。
