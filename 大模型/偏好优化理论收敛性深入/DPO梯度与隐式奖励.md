# DPO 梯度与隐式奖励

> 对应 Rafailov et al., *DPO*, NeurIPS 2023（梯度解释一节）；与 Ouyang et al., NeurIPS 2022 的 PPO 更新对照。

## 一、背景与挑战

DPO 看似只是二分类损失，但它的梯度带有明确的「自适应加权」结构。理解这一结构，才能解释训练中观察到的现象：为何简单样本很快没有梯度、为何被拒回答的似然会整体下降、为何 $\beta$ 过小会让训练早期剧烈波动。

## 二、核心原理

对 DPO 损失求导，得到的形式是「误判概率」乘以「胜者与败者对数似然梯度之差」。误判概率越大（当前模型越倾向选错），权重越高——这是一种隐式的困难样本挖掘。同时注意梯度是把胜者概率往上推、败者概率往下压，二者同时作用；由于两者共享大量 token，实践中常见胜者与败者的绝对对数似然都下降，只要差值在增大，损失仍在下降。这解释了 DPO 训练日志里「chosen logp 也在跌」的常见困惑。

## 三、数学形式

令 $\hat r_\theta(x,y)=\beta\log\frac{\pi_\theta(y|x)}{\pi_{ref}(y|x)}$，则

$$\nabla_\theta\mathcal L_{DPO}=-\beta\,\mathbb E\Big[\underbrace{\sigma\big(\hat r_\theta(x,y_l)-\hat r_\theta(x,y_w)\big)}_{\text{误判权重}}\big(\nabla_\theta\log\pi_\theta(y_w|x)-\nabla_\theta\log\pi_\theta(y_l|x)\big)\Big]$$

当模型已明显偏好 $y_w$ 时权重趋于 0，梯度自动衰减；当排序错误时权重趋于 1，梯度最大。

## 四、代码实现

```python
import torch, torch.nn.functional as F

def dpo_loss_with_diag(lp_w, lp_l, ref_w, ref_l, beta=0.1):
    r_w = beta * (lp_w - ref_w)
    r_l = beta * (lp_l - ref_l)
    loss = -F.logsigmoid(r_w - r_l).mean()
    with torch.no_grad():
        diag = {
            "reward_margin": (r_w - r_l).mean().item(),
            "pref_acc": (r_w > r_l).float().mean().item(),   # 隐式奖励的偏好准确率
            "mis_weight": torch.sigmoid(r_l - r_w).mean().item(),  # 平均误判权重
            "chosen_logp": lp_w.mean().item(),
        }
    return loss, diag
```

## 五、与其他对比

- 相对 PPO：PPO 梯度含优势估计与重要性比裁剪，需要在线采样；DPO 的自适应权重来自当前隐式奖励差，完全离线。
- 相对 IPO：平方损失的梯度是线性残差，不具备 sigmoid 的自动衰减性质，困难样本权重结构不同。
- 与 训练不稳定诊断：`pref_acc` 与 `reward_margin` 是 DPO 训练最有信息量的两个监控量。

## 六、常见误区

- 看到 chosen 的对数似然下降就判定训练失败。应看奖励差（margin）与偏好准确率是否上升。
- 忽视 margin 无界增长。margin 一路飙升往往伴随生成退化，需配合 IPO 式有界损失或早停。
- 认为 $\beta$ 只影响正则强度。它同时缩放了梯度中的误判权重输入，直接改变有效学习率。

## 七、与开源书对应

- rasbt/LLMs-from-scratch（手写训练循环与梯度观察）：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh（自动求导与优化诊断）：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- DPO 梯度里的自适应权重是什么？答：$\sigma(\hat r_l-\hat r_w)$，即当前模型排序错误的概率，起到困难样本加权作用。
- 为什么 chosen 与 rejected 的对数似然可能同时下降？答：损失只约束二者的隐式奖励差，且两个序列共享大量 token，绝对似然可同向移动。

## 九、演进

BT 似然梯度 → DPO 自适应加权解释 → 有界损失（IPO）与间隔损失（SimPO）的梯度重塑 → 在线迭代下的梯度—采样耦合分析。

## 十、小结

DPO 的梯度结构解释了它为何稳定、也解释了它为何会外推：自适应权重带来平滑收敛，但无界目标让 margin 无休止增长，需要额外约束。
