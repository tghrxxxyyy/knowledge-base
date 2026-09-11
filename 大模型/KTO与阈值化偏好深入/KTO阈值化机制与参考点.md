# KTO阈值化机制与参考点

> 对应 Ethayarajh et al. 2024《KTO: Model Alignment as Prospect Theoretic Optimization》、Kahneman & Tversky 1979《Prospect Theory》、Rafailov et al. 2023《Direct Preference Optimization》与 Meng et al. 2024《SimPO》。

## 一、背景与挑战

人类对结果的评价从来不是绝对的。同一笔收入，在预期之上会感到满意，在预期之下会感到失望；同样幅度的损失带来的痛苦，通常大于同等收益带来的快乐。这两点——**参照依赖**与**损失厌恶**——是前景理论的核心发现，也是 KTO 设计阈值机制的心理学依据。

在对齐场景里，这意味着：与其让模型学一个"绝对分数"（这正是奖励模型做的事，代价是要额外训练一个模型且容易过拟合到标注者偏好），不如让模型学"相对于某个参照点是否足够好"。问题在于参照点从哪来、阈值怎么定、以及两者如何影响梯度。若阈值设得太松，几乎所有样本都"已达标"，训练停滞；太紧则所有样本满梯度，等价于无约束的概率提升，容易导致退化。理解阈值机制，是掌握 KTO 的关键。

## 二、核心原理

**参照点的来源：参考模型。** KTO 用参考模型 $\pi_{\mathrm{ref}}$ 提供参照系，隐式奖励定义为

$$
r_\theta(x, y) = \beta \log \frac{\pi_\theta(y \mid x)}{\pi_{\mathrm{ref}}(y \mid x)}
$$

$r_\theta > 0$ 表示当前策略比参考模型更偏好这条输出，$r_\theta < 0$ 相反。因此"参照点"的语义是：**当前策略相对于初始策略的改进量**。参考模型通常取 SFT 后的模型，使得参照点具有"人类已经认可的回答分布"这一含义。

**阈值的两个作用。** 第一，定义"达标线"：可取样本需满足 $r_\theta \ge m_{\mathrm{desirable}}$，不可取样本需满足 $r_\theta \le -m_{\mathrm{undesirable}}$。第二，提供**截断**：落在阈值之间的样本梯度为零，不再贡献更新。

**损失厌恶的实现。** 正负两侧可以使用不同的阈值（或不同的权重系数）。若对负侧更敏感（阈值更近、权重更大），模型会更强烈地规避"变差"，这对应前景理论中 $\lambda > 1$ 的损失厌恶系数。

**无梯度区的双重性。** 它既是抗噪机制（噪声样本被优化到一定程度后自动停止影响），也是风险（阈值不匹配时训练提前停滞）。因此监控"活跃样本比例"是 KTO 调参的核心手段。

## 三、形式化与数学基础

**效用函数（阈值化）**：

$$
u(z) = \begin{cases}
z - m_{\mathrm{desirable}}, & z \ge m_{\mathrm{desirable}} \\
z + m_{\mathrm{undesirable}}, & z \le -m_{\mathrm{undesirable}} \\
0, & -m_{\mathrm{undesirable}} < z < m_{\mathrm{desirable}}
\end{cases}
$$

其中 $z = r_\theta(x, y)$。对应的损失为 $-u(z)$ 的阈值形式：

$$
\ell(z; d) = (1-d)\max(0, m_{\mathrm{des}} - z) + d\max(0, z + m_{\mathrm{undes}})
$$

（$d \in \{0,1\}$ 的 0/1 约定依实现而定，语义统一为：可取样本惩罚"低于正阈值"。）

**与前景理论价值函数的对照。** 标准形式：

$$
v(\Delta) = \begin{cases}
\Delta^{\alpha}, & \Delta \ge 0 \\
-\lambda (-\Delta)^{\beta}, & \Delta < 0
\end{cases}
$$

其中 $\Delta$ 是相对参照点的偏离，$\lambda > 1$ 为损失厌恶系数，$\alpha, \beta \in (0, 1)$ 表示边际敏感度递减。KTO 用**线性 + 死区（dead zone）**近似：$v$ 在参照点附近的平坦区被抽象为 $u(z) = 0$ 的区间，而 $\lambda > 1$ 由负侧更低的阈值或更大的权重实现：

$$
\lambda \approx \frac{\partial \ell / \partial z \big|_{z > -m_{\mathrm{undes}}}}{\partial \ell / \partial z \big|_{z < m_{\mathrm{des}}}}
$$

**阈值与 $\beta$ 的耦合。** 由于 $z = \beta \Delta$，条件 $z \ge m$ 等价于 $\Delta \ge m / \beta$。因此真正决定行为的是**比值**：

$$
\tau_{\mathrm{eff}} = \frac{m}{\beta}
$$

调参时应固定其一扫描另一，或直接在 $\tau_{\mathrm{eff}}$ 上做网格搜索。

**活跃样本比例**：

$$
\rho_{\mathrm{active}} = \Pr\left[ (d = 1 \wedge z < m_{\mathrm{des}}) \ \vee\ (d = 0 \wedge z > -m_{\mathrm{undes}}) \right]
$$

若 $z$ 近似服从 $\mathcal{N}(\mu, \sigma^2)$，可取样本的活跃概率为 $\Phi\left( \frac{m_{\mathrm{des}} - \mu}{\sigma} \right)$，可用于**按目标活跃比例反解阈值**：

$$
m_{\mathrm{des}} = \mu + \sigma \, \Phi^{-1}(\rho_{\mathrm{target}})
$$

这就是"按分位数设定初始阈值"的理论依据。

**梯度形式**：

$$
\frac{\partial \ell}{\partial z} = \begin{cases}
-1, & d = 1 \wedge z < m_{\mathrm{des}} \\
+1, & d = 0 \wedge z > -m_{\mathrm{undes}} \\
0, & \text{否则}
\end{cases}
$$

注意梯度幅度是**常数**（$\pm 1$），与偏离程度无关。这与 DPO 的 $\sigma(\cdot)$ 权重形成对比：DPO 对"已经分得很开"的配对自动降低权重，KTO 则在未达标区间内保持恒定压力，直到跨过阈值才突然归零。

**参考模型漂移的影响。** 若 $\pi_{\mathrm{ref}}$ 与真实参照点偏离 $\epsilon$：

$$
z = \beta \log \frac{\pi_\theta}{\pi_{\mathrm{ref}}} = \beta \log \frac{\pi_\theta}{\pi^\ast_{\mathrm{ref}}} + \beta \epsilon
$$

阈值语义随之整体平移 $\beta\epsilon$，说明参考模型的选择直接决定阈值的绝对含义。

## 四、代码实现

```python
# 阈值化效用：超出阈值才有梯度，中间为死区
def kto_utility(z, m_pos=1.0, m_neg=1.0):
    if z >= m_pos:
        return z - m_pos
    if z <= -m_neg:
        return z + m_neg
    return 0.0          # 死区：不产生梯度

# 对应的损失（效用取负并平移为 relu 形式）
def kto_loss_scalar(z, desirable, m_pos=1.0, m_neg=1.0):
    if desirable:
        return max(0.0, m_pos - z)
    return max(0.0, z + m_neg)
```

```python
# 按目标活跃比例反解阈值：用奖励分布的均值与标准差
import math

def threshold_from_target(r_values, target_active=0.5, desirable=True):
    n = len(r_values)
    mu = sum(r_values) / n
    var = sum((v - mu) ** 2 for v in r_values) / max(n - 1, 1)
    sigma = math.sqrt(var)
    # 用正态分位数近似；Phi^{-1} 的常用取值
    z_map = {0.2: -0.8416, 0.3: -0.5244, 0.4: -0.2533,
             0.5: 0.0, 0.6: 0.2533, 0.7: 0.5244, 0.8: 0.8416}
    zq = z_map[round(target_active, 1)]
    if desirable:
        return mu + sigma * zq        # 正阈值：越高越严格
    return -(mu - sigma * zq)         # 负阈值对称构造
```

```python
# 损失厌恶：对负侧施加更大权重（对应前景理论的 lambda > 1）
import torch
import torch.nn.functional as F

def kto_loss_asymmetric(r, desirable_mask, m_pos=1.0, m_neg=1.0, lambda_neg=1.5):
    loss_pos = F.relu(m_pos - r) * desirable_mask
    loss_neg = F.relu(r + m_neg) * (~desirable_mask) * lambda_neg
    return (loss_pos + loss_neg).mean()
```

```python
# 诊断：死区比例与分层活跃度，用于判断阈值是否合适
@torch.no_grad()
def threshold_diagnostics(r, desirable_mask, m_pos, m_neg):
    pos = r[desirable_mask]
    neg = r[~desirable_mask]
    pos_active = ((m_pos - pos) > 0).float().mean().item() if pos.numel() else 0.0
    neg_active = ((neg + m_neg) > 0).float().mean().item() if neg.numel() else 0.0
    return {
        "pos_mean": pos.mean().item() if pos.numel() else 0.0,
        "neg_mean": neg.mean().item() if neg.numel() else 0.0,
        "pos_active_ratio": pos_active,
        "neg_active_ratio": neg_active,
        "dead_zone_ratio": 1.0 - (pos_active * pos.numel() + neg_active * neg.numel())
                            / max(r.numel(), 1),
    }
```

## 五、与其他技术对比

| 机制 | DPO | KTO | SimPO |
|------|-----|-----|-------|
| 参照点 | 成对的另一条输出 | 参考模型 + 固定阈值 | 奖励 margin（无参考模型） |
| 梯度权重 | $\sigma(r_l - r_w)$，随分离度衰减 | 常数 $\pm 1$，跨阈值突降为 0 | 类似 KTO 的 margin 结构 |
| 死区 | 无（但权重趋近 0） | 有（显式） | 有 |
| 损失厌恶 | 无对应机制 | 可用非对称阈值/权重实现 | 无 |
| 阈值超参 | 无 | 有（正负两个） | 有（单个 margin） |
| 参考模型依赖 | 强 | 强 | 无 |

| 阈值设定方式 | 做法 | 优点 | 风险 |
|--------------|------|------|------|
| 固定经验值 | 使用论文默认 | 简单 | 与 $\beta$、模型不匹配 |
| 按分位数反解 | $\mu + \sigma\Phi^{-1}(\rho)$ | 可控活跃比例 | 假设近似正态 |
| 动态/课程 | 随训练调整 | 避免早停或全满 | 增加复杂度 |
| 非对称 | 负侧更严格 | 体现损失厌恶 | 需额外调 $\lambda$ |

## 六、常见误区

- **阈值全设为 0**：效用退化为普通回归，失去参照依赖与死区抗噪特性。
- **忽略正负阈值的不对称性**：对称阈值无法体现损失厌恶，也错失了 KTO 的表达力。
- **把阈值当作与 $\beta$ 无关的量**：真正起作用的是 $m/\beta$，单独调一端等于悄悄改了另一个。
- **不监控死区比例**：loss 很低可能只是因为绝大多数样本在死区，训练实际已停滞。
- **参考模型选错**：用未 SFT 的基座作参考，参照点语义失真，阈值含义随之漂移。
- **认为梯度幅度随偏离增大**：KTO 在未达标区间梯度恒为 $\pm 1$，跨过阈值后突降为 0，这是分段常数而非平滑衰减。
- **阈值一次设定不再调整**：训练过程中奖励分布会漂移，固定阈值可能在中途失效。

## 七、与开源书·权威来源对应

- Ethayarajh et al. 2024《KTO》：提出以阈值化的 Kahneman–Tversky 效用替代成对偏好，并给出阈值的经验设置与消融。
- Kahneman & Tversky 1979《Prospect Theory: An Analysis of Decision under Risk》：参照依赖、损失厌恶与价值函数形式的原始论文。
- Tversky & Kahneman 1992《Advances in Prospect Theory》：价值函数的参数化（$\alpha, \beta, \lambda$），是"非对称阈值"的理论依据。
- Rafailov et al. 2023《Direct Preference Optimization》：隐式奖励 $r = \beta\log(\pi_\theta/\pi_{\mathrm{ref}})$ 的来源，也是 KTO 参照点构造的基础。
- Meng et al. 2024《SimPO》：用奖励 margin 实现类似阈值机制但免去参考模型，可与 KTO 的阈值设计直接对照。
- HuggingFace TRL `KTOTrainer` 文档：暴露 desirable/undesirable 相关权重与阈值配置（参数名与默认值以官方最新文档为准）。

## 八、面试题

1. KTO 的参照点是什么？为什么可以用参考模型来提供它？
2. 写出阈值化效用函数，并解释中间"死区"的作用。
3. 前景理论的损失厌恶在 KTO 中如何体现？给出可实现的方式。
4. 为什么真正起作用的是 $m/\beta$ 而非单独的 $m$？
5. 如何按目标活跃比例反解阈值？需要什么假设？
6. KTO 的梯度幅度在未达标区间是什么形状？与 DPO 有何区别？
7. 参考模型选择不当会如何影响阈值语义？

## 九、演进与趋势

阈值机制正从"手工固定"走向"数据驱动与动态化"。趋势上，一是**按分位数自动初始化**：训练前统计奖励分布，按目标活跃比例反解阈值，使 $\rho_{\mathrm{active}}$ 落在合理区间；二是**自适应/课程阈值**：随训练推进逐步调整，避免早期全满、后期全死；三是**非对称与多目标阈值**：对不同反馈维度设不同参照点，把损失厌恶细化为逐维度的风险态度；四是**免参考模型的阈值化**（SimPO 的 margin 思路），降低内存与工程复杂度；五是**与长度归一化结合**，消除"变长即可跨阈值"的退化路径。

## 十、小结

阈值是 KTO 对齐人类风险态度的核心旋钮，其本质是**参照依赖 + 死区截断**：参照点由参考模型通过隐式奖励提供，达标线由正负阈值定义，落在中间区间的样本不产生梯度。理解它要抓住三点：真正起作用的是比值 $m/\beta$；梯度在未达标区间是常数 $\pm 1$、跨过阈值后突降为 0（这是抗噪来源）；正负阈值的不对称对应前景理论的损失厌恶。实践中应先按奖励分布的分位数设定初始阈值，再结合"活跃比例"诊断动态调整，而不是沿用论文默认值。
