# 梯度累积与BatchNorm

> 对应 pytorch/pytorch BatchNorm 行为与 d2l-ai/d2l-zh 归一化章节。

## 一、背景与挑战

BatchNorm 的统计量（均值/方差）基于当前 micro-batch 计算，而梯度累积把多个 micro-batch 的逻辑 batch 拆成时间上的多步。一个常见误解是「累积 K 步等效于 BN 看到 K 倍 batch」，实际 BN 每步仍只看当前 micro-batch，导致等效 batch 语义错位，影响训练稳定性与最终指标。在 CV 大模型或带 BN 的视觉-语言多模态中，这个错位尤为明显，可能造成精度下降或训练抖动，且难以排查——因为它不会报错，只是默默退化。

## 二、核心原理

BN 在训练时用当前批统计 $\mu_B,\sigma_B$ 归一化，并通过滑动平均维护推理期统计量。梯度累积不会自动合并多步的批统计，每步 BN 仍基于各自 micro-batch。因此累积的大 batch 语义对 BN 并不成立。大模型普遍改用 LayerNorm/RMSNorm，其归一化基于特征维、与 batch 大小无关，天然适配小 micro-batch 与累积。若必须用 BN（如某些 CV backbone），可改用 SyncBN 或在累积末尾统一统计，但成本更高，且需手动对齐前向与统计更新时机。

## 三、形式化与数学基础

BN 归一化：

$$
\hat x=\frac{x-\mu_B}{\sqrt{\sigma_B^2+\varepsilon}},\qquad y=\hat x\cdot\gamma+\beta
$$

其中 $\mu_B=\frac{1}{B_{\mathrm{micro}}}\sum x,\ \sigma_B^2=\frac{1}{B_{\mathrm{micro}}}\sum(x-\mu_B)^2$，仅来自当步 micro-batch，与累积步数 K 无关。而逻辑 batch 大小为 $K\cdot B_{\mathrm{micro}}$，二者不一致。正确的「大 batch BN」应取：

$$
\mu_{\mathrm{eff}}=\frac{1}{K B_{\mathrm{micro}}}\sum_{k=1}^{K}\sum_{b=1}^{B_{\mathrm{micro}}}x_{k,b}
$$

标准累积实现并不计算它，故每步 BN 只见 micro-batch 统计。

## 四、代码实现

```python
# Transformer 中常改用 LN 规避 BN 在累积下的统计错位
norm = torch.nn.LayerNorm(d_model)     # 不依赖 batch 统计
# 而非 BatchNorm1d, 避免累积下每步只看 micro-batch

def block(x):
    return norm(x)                      # 每个样本独立归一化

# 若必须用 BN, 可在累积末尾手动聚合统计(示意)
running_mean = 0.0
for x in micro_batches:
    running_mean += x.mean(dim=0)
running_mean /= len(micro_batches)      # 近似 mu_eff
```

## 五、与其他技术对比

| 归一化 | 依赖 batch | 适配累积 | 典型场景 |
| --- | --- | --- | --- |
| BatchNorm | 是 | 否 | CV |
| LayerNorm | 否 | 是 | NLP/LLM |
| RMSNorm | 否 | 是 | 现代 LLM |

## 六、常见误区

- 以为累积 K 步等效 BN 看到 K 倍 batch：实际每步 BN 仍只看 micro-batch。
- 训练/推理统计混用：滑动平均受小 micro-batch 噪声影响。
- 忽视 NLP/LLM 多用 LN：误把 CV 的 BN 习惯带入。
- 假设 DDP 下 BN 已跨卡合并：DDP 的 BN 同步与累积无关，仍需 micro-batch 本身够大。
- 用 BN 做归一化却开大累积：静默退化难排查。

## 七、与开源书·权威来源对应

- d2l-ai/d2l-zh 归一化章节详述 BN 行为与局限。
- pytorch/pytorch `BatchNorm`/`LayerNorm` 文档。
- 现代 LLM 架构（如 Llama）采用 RMSNorm，规避 batch 依赖。

## 八、面试题

- 为何大模型多用 LN 而非 BN？累积下 BN 错在哪？
- 若必须用 BN，如何在累积下近似大 batch 统计？
- SyncBN 能解决累积下的 BN 错位吗？为何 LLM 不用 BN？

## 九、演进与趋势

RMSNorm 进一步替代 LN（计算更省、无需均值），成为主流 LLM 归一化；同步 BN（SyncBN）可在多卡合并统计但仍有 micro-batch 限制。归一化选择正围绕「与 batch 解耦」收敛，使累积与小 micro-batch 不再冲突。

（补充）若业务强依赖 BN（例如复用某 CV backbone），在累积场景下的可行折中包括：使用 SyncBN 在卡间聚合统计以逼近大 batch 语义；或在累积末尾用本周期所有 micro-batch 重新计算 $\mu_{\mathrm{eff}},\sigma_{\mathrm{eff}}$ 再前向一遍（代价翻倍）；更简单的做法是把 BN 替换为 GN（GroupNorm），它在通道组内归一化，与 batch 大小基本解耦。实践要点：

- 优先审计模型是否真的需要 BN：多数 LLM/Transformer 组件已用 LN/RMSNorm。
- 若必须 BN，确保推理期滑动平均是用累积视角的统计更新，而非单 micro-batch。
- 在小 micro-batch + 大 K 组合下，BN 的滑动平均噪声会显著，需增大动量平滑。
- 用一组对照实验量化 BN 错位带来的精度损失，作为是否替换归一化的依据。

总之，归一化选型不是风格偏好，而是与累积语义强相关的基础设施决策，应在架构设计阶段而非训练报错后才处理。

（补充续）从数值角度，BN 在累积下等价于用「每 micro-batch 统计」去近似「逻辑 batch 统计」，二者方差随 K 与 micro-batch 大小反向变化：micro-batch 越小、K 越大，近似偏差越严重，训练曲线会出现抖动甚至平台。可用如下近似评估误差量级：

$$\frac{\mathrm{Var}(\mu_B)}{\mathrm{Var}(\mu_{\mathrm{eff}})}\approx \frac{B_{\mathrm{eff}}}{B}\gg 1$$

其中 $B$ 为 micro-batch 大小、$B_{\mathrm{eff}}=K\cdot B$ 为逻辑 batch。该比值越大，BN 错位越危险，应果断换用 LN/RMSNorm。

## 十、小结

累积下应选不依赖 batch 的归一化：BN 的批统计与累积语义错位，LN/RMSNorm 才是适配之选。理解 $\mu_{\mathrm{eff}}$ 与每步 $\mu_B$ 的差别，是避免精度回退与静默退化的关键。
