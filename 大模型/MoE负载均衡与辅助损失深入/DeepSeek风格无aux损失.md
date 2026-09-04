# DeepSeek风格无aux损失

> 对应 DeepSeek-AI 2024 *DeepSeek-V2*。

## 一、背景与挑战
辅助损失会影响主任务精度。DeepSeek-MoE 提出细粒度专家+共享专家+动态偏置，无需 aux loss 也能均衡。

## 二、核心原理
方案1：每个专家拆为 $m$ 个小专家（细粒度），路由从 $N$ 选 $k$ 变成从 $Nm$ 选 $mk$。
方案2：加共享专家（始终被所有 token 访问），路由专家只处理专门知识。
方案3：动态偏置 $b_i$ 加到路由分数 $S + b$，$b_i$ 累积每个专家的负载偏差。

## 三、形式化与数学基础
$ S_{x,i} = g(x)_i + b_i $，$b_i$ 在每步更新 $b_i \leftarrow b_i + \gamma (\text{load}_i - 1/N)$。过载专家 $b_i$ 减小，被冷落专家 $b_i$ 增大，自然均衡。

## 四、代码实现
```python
# 动态偏置
b = torch.zeros(N)
for step in range(steps):
    scores = gate(x) + b
    topk = scores.topk(k, dim=-1)
    load = (topk.indices.bincount(minlength=N).float() / B)
    b = b + gamma * (load - 1.0/N)
```

## 五、与其他技术对比
- vs aux loss：动态偏置不直接影响主损失。
- vs Expert Choice：仍为 token 选专家，但通过偏置均衡。

## 六、常见误区
- $\gamma$ 需仔细调节，过大震荡过小不均衡。
- 共享专家参数占用需计入总参数量。

## 七、与开源书/权威来源对应
- deepseek-ai/DeepSeek-V2。
- d2l-ai/d2l-zh。

## 八、面试题
- 动态偏置如何工作？答：过载专家 $b$ 减小，被路由概率降低。

## 九、演进与趋势
aux loss → 动态偏置 → 无损均衡。

## 十、小结
DeepSeek 方案证明 MoE 均衡可无需 aux loss，是重要工程创新。
