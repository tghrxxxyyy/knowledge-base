# 混合精度与 AMP

> 对应 Micikevicius et al. 2018（Mixed Precision Training）、NVIDIA AMP 与 BF16 实践。

## 一、背景与挑战

大模型训练受显存与算力双重约束。用 FP32 全程训练最稳但最贵：权重、激活、梯度、优化器状态都占 4 字节。混合精度训练（Mixed Precision Training）由 Micikevicius 等人于 2018 年系统化提出：用 FP16/BF16 做前向/反向的矩阵运算以翻倍吞吐、减半显存，同时用 FP32 主副本保存权重与优化器状态以保数值稳定。挑战在于：低精度动态范围小，易出现下溢/溢出、梯度消失，需要配套策略。

## 二、核心原理

三类数值格式：

- **FP16**：指数位少（5 bit），动态范围小，易溢出，需 **loss scaling** 把梯度放大以避免下溢。
- **BF16**（bfloat16）：指数位与 FP32 相同（8 bit），动态范围大，训练更稳定，是当今主流，通常不需 loss scaling。
- **FP32**：主权重/优化器状态副本，保证更新精度。

训练流程：用 FP16/BF16 算前向与反向得低精度梯度，反传后**转 FP32 累加到主梯度**，更新 FP32 主权重，再 cast 回低精度用于下一步前向。BF16 因范围大，基本规避了 FP16 的溢出难题，从而简化流程。

混合精度的「稳定性」本质上来自动态范围而非位数多少。FP32 与 BF16 都有 8 位指数，故 BF16 能表示与 FP32 同量级的最大值与最小值，梯度在反向传播中即使很小也不易下溢、很大也不易溢出——这正是它「训练稳定、常无需 loss scaling」的原因。FP16 只有 5 位指数，动态范围窄，梯度幅值稍大就溢出为 Inf、稍小就下溢为 0，必须靠 loss scaling 把梯度整体放大到可表示区间，再在优化器步里除回，操作繁琐且易调错。

实战要点：① 现代 GPU（Ampere 及以后）原生支持 BF16 张量核心，应优先用 BF16；② 主权重与 Adam 的动量/方差必须保持 FP32，否则长期累积的细小更新会被截断；③ 某些对精度敏感的层（如 LayerNorm 的累加、softmax 的指数）框架会自动用 FP32 计算再转回，无需手动干预；④ 梯度裁剪、参数更新等数值操作应在 FP32 下进行。当进一步追求极致吞吐，可探索 FP8 训练（H100 等支持），它用更小的位宽换取更高算力，但需要更谨慎的 scaling 与精度监控，目前多用于已验证稳定的大规模流程。

## 三、形式化与数学基础

权重低精度副本 $W_{\text{lp}} = \text{cast}_{16}(W_{\text{fp32}})$。前向：

$$Y = \text{cast}_{16}\big(\text{matmul}(X,\ W_{\text{lp}})\big)$$

FP16 下对损失做缩放以避免小梯度下溢：

$$\tilde{\mathcal{L}} = s\cdot\mathcal{L},\quad \nabla = \text{backward}(\tilde{\mathcal{L}}),\quad g = \nabla / s$$

更新时反量化回 FP32 主副本：

$$W_{\text{fp32}} \leftarrow \text{optimizer}\big(W_{\text{fp32}},\ \text{cast}_{32}(g)\big)$$

BF16 因 $e=8$ 与 FP32 同范围，典型无需缩放：$s=1$。显存节省约一半（激活/梯度用 2 字节）。

## 四、代码实现

PyTorch AMP 自动混合精度（BF16，无需 scaling）：

```python
import torch
from torch.cuda.amp import autocast
with torch.cuda.amp.autocast(dtype=torch.bfloat16):
    loss = model(x)
loss.backward()
optimizer.step(); optimizer.zero_grad()
```

FP16 旧式需 GradScaler：

```python
from torch.cuda.amp import GradScaler
scaler = GradScaler()
with autocast(dtype=torch.float16):
    loss = model(x)
scaler.scale(loss).backward()
scaler.step(optimizer); scaler.update()
```

## 五、与其他技术对比

| 类型 | 指数位 | 动态范围 | 推荐 | 备注 |
|------|--------|---------|------|------|
| FP32 | 8 | 大 | 主副本 | 慢/占 |
| FP16 | 5 | 小 | 需 loss scaling | 易溢出 |
| BF16 | 8 | 大 | 首选 | 稳、无需 scaling |

## 六、常见误区

- 误以为混合精度就是「全用半精度」，丢失 FP32 主副本导致数值漂移。
- FP16 忘了 loss scaling，小梯度下溢、训练不收敛。
- 在支持 BF16 的硬件上仍用 FP16 + scaling，徒增复杂度。
- 把优化器状态也压成半精度（Adam 动量/方差需 FP32）。

## 七、与开源书·权威来源对应

- Micikevicius et al., 2018, *Mixed Precision Training*（ICLR）。
- NVIDIA 文档：Automatic Mixed Precision (AMP)。
- 以官方最新文档为准。

## 八、面试题

- BF16 相比 FP16 为何训练更稳定？指数位差异意味着什么？
- 混合精度为何仍需 FP32 主权重与优化器状态？
- FP16 的 loss scaling 解决什么问题？

## 九、演进与趋势

从 FP16+scaling 全面转向 BF16（Ampere 起硬件原生支持）。进一步有 FP8 训练（H100 等）用于更激进的吞吐/显存节省，配合 scaling 与精度监控，正逐步进入大规模训练实践。

## 十、小结

混合精度用低精度做计算、FP32 保主副本，在几乎不损精度下翻倍吞吐、减半显存。BF16 因动态范围大成为当今首选，FP16 需 loss scaling。它是大模型训练性价比最高的基础优化之一。
