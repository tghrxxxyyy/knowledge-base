# 优化器详解：SGD / Momentum / Adam

> 对应 d2l-zh 第 11 章「优化算法」、Ruder *An Overview of Gradient Descent Optimization Algorithms* (2016)、Kingma & Ba *Adam* (2015)、Loshchilov & Hutter *Decoupled Weight Decay Regularization* (AdamW, ICLR 2019)、Shoeybi et al. *Megatron-LM* 中的大模型训练超参实践。理解各优化器差异是大模型调参与「loss 突刺」排障的基础。

## 一、核心概念

优化的目标是最小化经验风险 $L(\theta)$。一阶方法沿负梯度更新；二阶方法试图利用曲率。大模型因参数量在 $10^9\sim10^{12}$，几乎只用一阶 + 自适应缩放。

| 优化器 | 更新要点 | 典型适用 | 主要缺陷 |
|--------|----------|----------|----------|
| SGD | $\theta \leftarrow \theta - \eta g$ | 凸问题、CV 微调、需精调 | 需小学习率、对病态曲率慢 |
| Momentum | $v \leftarrow \gamma v + \eta g;\ \theta \leftarrow \theta - v$ | 加速收敛、冲出窄谷 | $\gamma$ 敏感、仍各向同性 |
| NAG | 用「前瞻」位置算梯度 | 经典加速 | 大模型少用 |
| RMSProp | $v \leftarrow \beta v + (1-\beta)g^2;\ \theta \leftarrow \theta - \eta g/\sqrt{v+\epsilon}$ | 非平稳、RNN/RL | 无动量时仍震荡 |
| AdaGrad | 累计 $g^2$ 自适应降 LR | 稀疏特征/推荐 | 累加过大导致 LR 衰死 |
| Adam | 一阶矩 $m$ + 二阶矩 $v$ + 偏差校正 | **默认首选** | 泛化争议、weight decay 耦合 |
| AdamW | Adam + **解耦** weight decay | **大模型预训练/微调标配** | 超参多（$\beta_1,\beta_2,\epsilon,\eta,\lambda$） |
| Lion / Sophia / Muon | 符号梯度/二阶估计/矩阵正交化 | 2024+ 探索 | 生态与稳定性仍在验证 |

**直觉**：SGD 只看「此刻坡度」；Momentum 记住「最近坡度的平均」像重球滚下山；Adam 再记「梯度的方差」，把每个参数的步长按历史波动自动缩放——陡峭方向步子小、平缓方向步子大。

## 二、核心原理与关键差异

### 2.1 动量：把随机梯度的噪声平均掉

$$ v_t = \gamma v_{t-1} + \eta g_t, \qquad \theta_{t+1} = \theta_t - v_t $$

$\gamma$ 常取 0.9。等价于对历史梯度做指数加权平均，等效学习率在一致方向上可放大到 $\eta/(1-\gamma)$，在震荡方向相互抵消。物理类比：带摩擦的重球，窄谷方向噪声被平均，沿谷底加速。

### 2.2 Adam：自适应 + 偏差校正

$$ m_t = \beta_1 m_{t-1} + (1-\beta_1) g_t $$
$$ v_t = \beta_2 v_{t-1} + (1-\beta_2) g_t^2 $$
$$ \hat{m}_t = \frac{m_t}{1-\beta_1^t}, \quad \hat{v}_t = \frac{v_t}{1-\beta_2^t} $$
$$ \theta_{t+1} = \theta_t - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon} $$

默认 $\beta_1=0.9$、$\beta_2=0.999$（大模型常把 $\beta_2$ 调到 0.95～0.98 以更快适应非平稳梯度）、$\epsilon=10^{-8}$。

**偏差校正为何重要**：$m_0=v_0=0$，前几步 $m_t$ 被 $(1-\beta_1^t)$ 系统性缩小，$\hat{m}$ 除回去才能在冷启动阶段保持正确步长；若不校正，早期更新几乎停滞，对短训练/小数据伤害明显。

### 2.3 AdamW：把正则从梯度里拆出来

经典 Adam + L2 会把 $\lambda\theta$ 混进 $g$，再被 $1/\sqrt{v}$ 缩放——**每个参数的正则强度被自适应步长扭曲**，正则变弱且不均匀。AdamW 改为：

$$ \theta_{t+1} = \theta_t - \eta\left(\frac{\hat{m}_t}{\sqrt{\hat{v}_t}+\epsilon} + \lambda \theta_t\right) $$

权重衰减与梯度更新解耦，$\lambda$ 语义与 SGD 一致，泛化更稳。这是「大模型预训练偏好 AdamW」的直接原因。

### 2.4 与大模型训练的关联

- **loss 突刺（loss spike）**：常与 $\eta$ 过大、$\beta_2$ 过大（对尖峰不敏感）、梯度未裁剪有关；实践先降 $\eta$、检查数据脏样本、看 grad norm。
- **warmup**：前若干 step 线性升 $\eta$，让 $v$ 先估准梯度尺度，避免第一步就用未校准的自适应步长砸飞参数。
- **lr schedule**：cosine 衰减 + warmup 是预训练默认；微调常用常数小 $\eta$ 或余弦短程。
- **精度**：bf16 训练时优化器状态通常保持 fp32 master weights（混合精度），否则 $\sqrt{v}$ 下溢。

## 三、形式化与数学基础

把更新写成对角近似的自然梯度：

$$ \theta_{t+1} = \theta_t - \eta\, D_t^{-1/2} g_t, \qquad D_t = \text{diag}(\sqrt{\hat{v}_t}) $$

Adam 可视为用梯度二阶矩对 Fisher 对角的在线估计做预条件。SGD 收敛的经典结论（凸/非凸）依赖 $\sum \eta_t = \infty,\ \sum \eta_t^2 < \infty$；自适应方法在非凸条件下同样有 $O(1/\sqrt{T})$ 的梯度范数界，但**泛化差距**（training loss 低、test 不低）在早期文献中对 Adam 有批评，后续分析多指向 weight decay 耦合与 batch size 交互，AdamW + 合适超参可大幅缓解。

动量的等效关系：恒定梯度 $g$ 下，Momentum 稳态速度 $v^* = \eta g/(1-\gamma)$，即有效学习率放大 $1/(1-\gamma)$——这也是「加 momentum 后要重调 $\eta$」的原因。

## 四、代码实现

```python
import torch
import torch.nn as nn
from torch.optim import SGD, Adam, AdamW

model = nn.Linear(768, 10)

# 大模型微调默认：AdamW + 解耦衰减
opt = AdamW(
    model.parameters(),
    lr=2e-5,
    betas=(0.9, 0.95),   # 大模型常用 beta2=0.95
    eps=1e-8,
    weight_decay=0.01,   # 与 lr 解耦
)

# 带 warmup + cosine 的调度（示意）
def lr_lambda(step, warmup=500, total=10000):
    if step < warmup:
        return step / max(1, warmup)
    import math
    progress = (step - warmup) / max(1, total - warmup)
    return 0.5 * (1 + math.cos(math.pi * progress))

sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_lambda)

# 训练步（混合精度下用 fp32 master + scaler，此处省略 autocast）
for x, y in loader:
    opt.zero_grad(set_to_none=True)
    loss = nn.functional.cross_entropy(model(x), y)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)  # 大模型几乎必做
    opt.step()
    sched.step()
```

排障清单：打印 `opt.param_groups[0]["lr"]`、`loss.grad.norm()`、`betas/eps/wd`；与论文对齐时核对 **是否 AdamW、是否 warmup、是否 grad clip、是否全局 batch 一致**——这四项比换优化器本身更常造成「复现不了」。

## 五、与其他技术对比

| 维度 | SGD+Momentum | Adam | AdamW | Lion |
| --- | --- | --- | --- | --- |
| 自适应步长 | 否 | 是 | 是 | 是（符号） |
| 内存（每参数） | 1 份速度 | 2 份矩 | 2 份矩 | 1 份动量 |
| weight decay | 直接加在梯度 | 与 L2 耦合扭曲 | **解耦** | 按实现 |
| 超参敏感度 | $\eta,\gamma$ | $\eta,\beta_1,\beta_2,\epsilon$ | 同左 + $\lambda$ | $\eta,\beta,\lambda$ |
| 大模型预训练 | 少（除特殊架构） | 历史主流 | **当前主流** | 探索中 |
| CV ImageNet 微调 | 常见 | 常见 | 常见 | 较少 |

与 **二阶方法**（K-FAC、Shampoo、Muon）：曲率信息更全、可更大步长，但实现与通信复杂，多在小模型或特定架构验证，尚未全面取代 AdamW。

## 六、常见误区

1. **Adam 比 SGD 一定泛化差**——多数差距来自 weight decay 耦合、调参不公与 batch size；AdamW 下差距显著缩小。
2. **加大 weight_decay 就能防过拟合**——在 Adam 上若未用 AdamW，$\lambda$ 会被自适应缩放「吃掉」，表现与预期不符。
3. **momentum=0.99 对所有任务都安全**——长动量在非平稳梯度（大 batch 变动、数据切换）下滞后，可能放大陈旧方向。
4. **可以只靠调优化器救 loss spike**——先查数据、grad clip、LR 峰值与精度溢出，优化器排最后。
5. **bias correction 可以忽略**——短跑微调/RL 奖励模型上不可忽略；极长预训练后期影响变小。
6. **所有参数同一套 $\eta$** ——embedding、LayerNorm、头部常分 param group 设不同 LR/WD，是成熟代码库的常规操作。

## 七、与开源书·权威来源对应

- d2l-zh 第 11 章：动量、AdaGrad、RMSProp、Adam 从零实现。
- Kingma & Ba, *Adam: A Method for Stochastic Optimization*, ICLR 2015。
- Loshchilov & Hutter, *Decoupled Weight Decay Regularization*, ICLR 2019（AdamW）。
- Ruder, *An Overview of Gradient Descent Optimization Algorithms*, 2016。
- Llama / GPT / Megatron 技术报告与附录超参（$\eta$、warmup、clip、$\beta_2$）。
- Schwartz *Don't Decay the Learning Rate, Increase the Batch Size*（优化与泛化讨论）。

## 八、面试题

**1. 为什么大模型预训练偏好 AdamW？**  
要点：自适应步长适配稀疏/异构梯度 + 解耦 weight decay 语义正确、正则不被 $1/\sqrt{v}$ 扭曲；配合 warmup 与 grad clip 稳定长程训练。

**2. 偏差校正对 Adam 早期训练为何重要？**  
要点：$m,v$ 从 0 启动被 $(1-\beta^t)$ 缩小，除回校正量才能在前几步用正确步长，避免冷启动停滞或尺度错误。

**3. Momentum 如何「抗震荡」？**  
要点：对梯度指数平均，垂直于谷底的噪声方向相互抵消，沿谷底方向累积加速；有效 LR 放大约 $1/(1-\gamma)$。

**4. loss 突刺时优化器侧你会先动什么？**  
要点：降峰值 LR / 检查 warmup、确认 grad clip 生效、看 $\beta_2$ 是否过大、检查 bf16/fp32 master 与 $\epsilon$；同时排查坏 batch。

**5. Adam 每个参数多存什么？大约多少显存？**  
要点：一阶矩 $m$ 与二阶矩 $v$ 两份（fp32 时每参数 8 字节，若加 master weights 再 +4），这是大模型优化器状态显存的主体之一。

## 九、演进与趋势

- **优化器状态分片**：ZeRO-1/2 把 $m,v$ 切到不同 DP rank，HBM 占用大幅下降，成为 DeepSpeed/FSDP 标配。
- **新算法**：Lion（符号更新、更省状态）、Sophia（Hessian 对角裁剪）、Muon（正交化动量矩阵）在中小规模展示更稳/更快，向大模型迁移中。
- **与并行耦合**：梯度裁剪的范数在张量/流水并行下要**全局归约**，否则各 rank 裁剪不一致等效于引入噪声。
- **长上下文与 MoE**：路由负载不均使梯度更非平稳，$\beta_2$、clip、专家分学习率成为调参热点。
- **可学习优化器 / 超参预测**：学出来的更新规则仍难全面超过调好的 AdamW，工业界以「AdamW + 强调度 + 分组 LR」为主干做增量创新。

## 十、小结

SGD 给干净的一阶基线，Momentum 解决方向噪声，Adam 用二阶矩做逐参数步长预条件，AdamW 修正了正则耦合——这条演进线就是大模型训练超参的骨架。实战记住四件事：**AdamW、warmup、grad clip、分组 LR**；出问题时先对齐这四项再谈换优化器。优化器是系统参数：与精度、并行、调度、数据共同决定你能不能把 loss 平稳压下去。
