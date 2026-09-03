# KL 锚定与正则化

> 对应 Ouyang et al., NeurIPS 2022（KL 惩罚）；Rafailov et al., *DPO*, NeurIPS 2023（隐式 KL）；Gao et al., ICML 2023（KL 与过优化）。

## 一、背景与挑战

KL 锚定是对齐里最重要的单个旋钮：它同时决定了偏离基座多远、对齐能获得多少收益、以及付出多少能力代价。但实践中它经常被误用——只设一个固定系数、不监控实际 KL 值、也不区分不同层次的锚定手段。

## 二、核心原理

三种锚定层次。分布层：显式 KL 惩罚（PPO）或隐式 KL（DPO 的 $\beta$ 与参考模型），直接约束输出分布的偏移。参数层：L2-SP 或权重插值，约束参数距离，间接限制行为偏移。数据层：混入预训练或通用指令数据，让能力方向持续获得梯度。三者作用点不同：分布层控制「输出行为像不像基座」，参数层控制「权重像不像」，数据层保证「能力有没有被复习」。工程要点是把 KL 当预算而非常数：先按目标 KL 反推系数（自适应 KL 控制），并把实际 KL 值作为一等监控量，因为同一 $\beta$ 在不同数据与基座上产生的实际 KL 可以差一个数量级。

## 三、数学形式

自适应 KL 控制（按目标 KL 调整系数）：

$$\beta_{t+1}=\beta_t\cdot\Big(1+K_\beta\cdot\mathrm{clip}\Big(\frac{\widehat{\mathrm{KL}}_t-\mathrm{KL}_{\text{target}}}{\mathrm{KL}_{\text{target}}},\,-0.2,\,0.2\Big)\Big)$$

即实际 KL 超目标时收紧惩罚、低于目标时放松。参数层锚定为 $\mathcal L+\frac{\lambda}{2}\|\theta-\theta_{\text{base}}\|_2^2$。注意 DPO 的 $\beta$ 与 PPO 的 KL 系数虽同源（都来自 $\pi^*\propto\pi_{ref}e^{r/\beta}$），但一个作用在损失内部的奖励尺度上、一个作用在采样奖励的惩罚项上，数值不可直接互换。

## 四、代码实现

```python
class AdaptiveKLController:
    def __init__(self, beta=0.02, target=6.0, horizon=10000):
        self.beta, self.target, self.horizon = beta, target, horizon

    def update(self, kl_hat, n_steps):
        err = (kl_hat - self.target) / self.target
        mult = 1 + 0.2 * max(min(err, 0.2), -0.2) * (n_steps / self.horizon)
        self.beta *= mult
        return self.beta

def anchored_loss(model, base_params, task_loss, lam=1e-4):
    # 参数层锚定：L2-SP，约束权重与基座的距离
    pen = sum(((p - base_params[n]) ** 2).sum()
              for n, p in model.named_parameters() if n in base_params)
    return task_loss + 0.5 * lam * pen
```

## 五、与其他对比

- 与 过优化缩放律：那里的 $\mathrm{KL}^*$ 正是本节 KL 预算的理论取值来源。
- 与 数据混合与重放：数据层锚定不限制偏移方向，只保证能力被复习，与 KL 互补。
- 与 模型合并与权重插值：那是训练后的参数层锚定，可在不重训的情况下调节取舍点。

## 六、常见误区

- 只设 $\beta$ 不看实际 KL。同一 $\beta$ 在不同设置下的实际偏移差异巨大，必须监控。
- 认为 KL 越小越安全。KL 过小意味着对齐几乎没发生，收益也一并消失。
- 把 DPO 的 $\beta$ 与 PPO 的 KL 系数当同一量纲互抄。二者作用位置不同，需各自扫参。

## 七、与开源书对应

- mlabonne/llm-course（RLHF 超参与实现细节）：https://github.com/mlabonne/llm-course
- d2l-zh（正则化与优化控制）：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为什么要用自适应 KL 控制？答：固定系数下实际 KL 随数据与训练阶段剧烈变化，自适应控制可把偏移稳定在预算附近。
- 分布层与参数层锚定的区别？答：分布层直接约束输出行为的偏移，参数层约束权重距离，后者更粗但实现简单且可在训练后用插值调节。

## 九、演进

固定 KL 惩罚 → 自适应 KL 控制（按目标反推系数） → 加入参数层锚定与数据层重放 → 用过优化曲线确定 KL 预算 → 训练后权重插值微调取舍点。

## 十、小结

把 KL 当预算来管理，而不是当常数来设置：先定目标偏移、再自适应调系数、并把实际 KL 与能力指标一起监控。
