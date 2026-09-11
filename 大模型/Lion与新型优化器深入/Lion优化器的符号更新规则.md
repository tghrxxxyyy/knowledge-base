# Lion优化器的符号更新规则

> 对应 Chen et al. 2023《Symbolic Discovery of Optimization Algorithms》(Lion, arXiv:2302.06675) 与 mlabonne/llm-course 现代优化器章节。

## 一、背景与挑战

AdamW 自 2019 年起成为深度学习训练的事实标准，但它需为每个参数保存**一阶矩 $m$ 与二阶矩 $v$ 两份状态**，显存开销随参数量线性翻倍。当模型进入十亿、百亿参数，优化器状态本身就成了扩展瓶颈，甚至限制可训练的 batch 与模型规模。

Lion（EvoLved Sign Momentum）由 Google Brain 通过程序化搜索发现，核心思想是：**只保留一个动量缓冲区，更新方向取动量的符号（sign）**。这把优化器状态减半，且在多类大规模任务上媲美甚至超越 AdamW。

## 二、核心原理

Lion 的更新可概括为「**带动量的符号 SGD + 解耦权重衰减**」：

1. 维护单一动量 $m$（不保存二阶矩）。
2. 计算更新方向候选 $c=\beta_1 m + (1-\beta_1)g$，即动量与新梯度的指数滑动平均。
3. 对 $c$ 取逐元素符号 $\mathrm{sign}(c)$，得到只含 $\{-1,0,+1\}$ 的方向。
4. 用恒定步长 $\eta$ 沿符号方向更新，并解耦地减去 $\eta\lambda\theta$ 做权重衰减。

关键差异：AdamW 用二阶矩做**自适应幅度缩放**（每参数幅度不同），Lion 用**恒定幅度、符号方向**，因此对所有参数一视同仁，对学习率更敏感，但内存省一半。

## 三、形式化与数学基础（含 LaTeX）

动量更新与参数更新分别为

$$
m_t = \beta_1 m_{t-1} + (1-\beta_1) g_t
$$

$$
\theta_{t+1} = \theta_t - \eta\big(\mathrm{sign}(m_t) + \lambda\theta_t\big)
$$

其中 $\mathrm{sign}(z)=\mathbb{I}[z>0]-\mathbb{I}[z<0]$，把每元素映射到 $\{-1,0,+1\}$，更新幅度恒定、仅由 $\eta$ 决定。相比 AdamW 的 $\theta_{t+1}=\theta_t-\eta(\hat m_t/(\sqrt{\hat v_t}+\epsilon)+\lambda\theta_t)$，Lion 完全不含 $\hat v_t$，故无二阶状态。

## 四、代码实现（围栏配平）

```python
import torch

# Lion 单步更新（伪代码，参数与动量同形状）
def lion_step(p, g, m, lr, beta1, wd):
    c = beta1 * m + (1.0 - beta1) * g      # 动量更新
    m.copy_(c)
    update = c.sign()                       # 取符号方向
    p.mul_(1.0 - lr * wd)                   # 解耦权重衰减
    p.add_(update, alpha=-lr)               # 符号步长
    return p
```

## 五、与其他技术对比

- 与 **AdamW** 相比：Lion 步长恒定、省一半状态、对 lr 更敏感；AdamW 自适应更稳、更易复现。
- 与 **SGD+Momentum** 相比：Lion 取符号而非原值，幅度被压缩，梯度量纲不影响方向。
- 与 **Adafactor** 相比：Adafactor 用因式分解近似二阶矩，Lion 直接去掉，更简洁。

## 六、常见误区

- 「直接套用 AdamW 的 lr」——Lion 通常需比 AdamW 小 3~10 倍的学习率，否则发散。
- 「符号更新丢失信息」——幅度信息被 $\eta$ 统一接管，方向信息仍由动量保留。
- 「省状态就更快」——每步计算量相近，主要收益在显存与可扩展性。

## 七、与开源书·权威来源对应

- Chen et al. 2023 通过符号化搜索发现 Lion，并在图像分类、视觉 Transformer、语言模型上给出对比。
- mlabonne/llm-course 将 Lion 列为现代低状态优化器代表。
- Loshchilov & Hutter 2019 AdamW 是理解解耦权重衰减的基线参照。

## 八、面试题

- 问：Lion 为何显存更省？答：只存一阶动量，无二阶矩状态，状态从 2 份降为 1 份。
- 问：Lion 与 AdamW 更新方向差异？答：AdamW 用 $\hat m/\sqrt{\hat v}$ 自适应，Lion 用 $\mathrm{sign}(m)$ 恒定幅度。
- 问：为何 lr 要调小？答：符号方向已是单位幅度，过大步长会剧烈震荡，需更小 $\eta$。

## 九、演进与趋势

符号类优化器启发了更多低成本训练方案，与 **FP8/低精度状态、FSDP/ZeRO 切分**结合前景广阔；自动化搜索也在探索任务自适应的符号变体。

### 关键要点速查

- Lion = 单动量 + 符号更新 + 解耦权重衰减，状态比 AdamW 少一半。
- 更新方向 $\mathrm{sign}(m)$ 幅度恒定，仅由学习率 $\eta$ 决定，故对 lr 敏感。
- 迁移时 lr 需降到 AdamW 的约 1/3~1/10，否则易发散。
- $\beta_1$ 常取更高（如 0.95），因符号更新依赖动量积累方向。
- 省的是显存与可扩展性，不是单步算力，每步计算量相近。
- 与 SGD+Momentum 比：符号压缩幅度，梯度量纲不影响方向。
- 与 Adafactor 比：直接去二阶矩更简洁，但状态近似能力弱。
- 符号更新利于低精度（FP8）实现，与 ZeRO/FSDP 切分配合佳。

- 实现时注意 in-place 操作顺序，先 copy 动量再取符号。
- 与梯度裁剪配合时，裁剪应在取符号前完成。
- bf16 下符号更新对数值误差不敏感，适合低精度栈。

## 十、小结

Lion 以符号更新换取显存与速度：只保留动量、取符号方向、解耦衰减，是大模型优化器谱系中兼顾效率与效果的重要新成员。
