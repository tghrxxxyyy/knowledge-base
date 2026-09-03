# IPO 恒等偏好优化

> 对应 Azar et al., *A General Theoretical Paradigm to Understand Learning from Human Preferences*（ΨPO / IPO）, AISTATS 2024。

## 一、背景与挑战

DPO 用 logistic 损失最大化偏好似然，当某个偏好对在数据中是「确定性」的（该 prompt 下 $y_w$ 总是胜出）时，最优解会把策略比推向无穷：只要不断增大 $\log(\pi_\theta(y_w)/\pi_\theta(y_l))$ 损失就继续下降。结果是模型对少数样本过拟合、并且实际上绕过了 KL 正则的约束。

## 二、核心原理

Azar 等提出通用范式 ΨPO：把偏好优化写成对偏好概率经某个非线性映射 $\Psi$ 后的期望效用最大化，并证明 DPO 相当于取 $\Psi=\log\frac{p}{1-p}$（logit），正是这个无界映射造成过拟合。IPO 取 $\Psi=\mathrm{Id}$（恒等映射，故名 Identity-PO），把目标转化为对策略对数比的有界回归：让隐式奖励差回归到一个由正则强度决定的常数，而不是越大越好。

## 三、数学形式

令 $h_\theta(x,y_w,y_l)=\log\dfrac{\pi_\theta(y_w|x)\,\pi_{ref}(y_l|x)}{\pi_\theta(y_l|x)\,\pi_{ref}(y_w|x)}$，IPO 目标为

$$\mathcal L_{IPO}=\mathbb E_{(x,y_w,y_l)\sim D}\Big[\big(h_\theta(x,y_w,y_l)-\tfrac{1}{2\tau}\big)^2\Big]$$

其中 $\tau$ 是 KL 正则系数。可见最优点在 $h_\theta=\frac{1}{2\tau}$ 处取得，是有限值；而 DPO 的 $-\log\sigma(\beta h_\theta)$ 在 $h_\theta\to\infty$ 时才趋于最小，故解无界。

## 四、代码实现

```python
import torch.nn.functional as F

def seq_logp(model, input_ids, labels, attn):
    out = model(input_ids=input_ids, attention_mask=attn).logits[:, :-1]
    lp = F.log_softmax(out.float(), dim=-1)
    tgt = labels[:, 1:]
    mask = (tgt != -100)
    tgt = tgt.masked_fill(~mask, 0)
    tok = lp.gather(-1, tgt.unsqueeze(-1)).squeeze(-1) * mask
    return tok.sum(-1), mask.sum(-1)          # 返回序列对数似然与有效长度

def ipo_loss(lp_w, lp_l, ref_w, ref_l, tau=0.1):
    h = (lp_w - ref_w) - (lp_l - ref_l)       # 对数比差
    return ((h - 1.0 / (2 * tau)) ** 2).mean()
```

## 五、与其他对比

- 相对 DPO：把「越大越好」改成「回归到目标值」，天然抑制确定性偏好上的过拟合。
- 相对 cDPO / rDPO：IPO 治的是损失无界，噪声鲁棒变体治的是标签翻转；两者可叠加。
- 与 偏好优化理论收敛性深入 中的 KL 正则闭式解直接呼应：$\frac{1}{2\tau}$ 就来自那个闭式解。

## 六、常见误区

- 以为 IPO 不需要参考模型。它依然需要 $\pi_{ref}$，只是损失形态变了。
- 把 $\tau$ 直接照抄 DPO 的 $\beta$。二者在最优点位置上的作用方式不同，需重新扫参。
- 认为平方损失一定更稳。回归目标点设置不当时会出现欠拟合，偏好可分性反而下降。

## 七、与开源书对应

- mlabonne/llm-course（偏好优化对比实验）：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch（从零实现训练循环，便于替换损失函数）：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- IPO 为什么叫 Identity-PO？答：在 ΨPO 框架中它取偏好概率的恒等映射作为效用，而 DPO 取 logit 映射。
- IPO 如何抑制过拟合？答：把无界的对数似然比最大化改为向有限目标值 $1/(2\tau)$ 的平方回归，最优解有界。

## 九、演进

DPO（logit 效用，无界） → ΨPO 通用范式 → IPO（恒等效用，有界回归） → 与噪声鲁棒、长度归一等技巧组合。

## 十、小结

IPO 的价值在于把 DPO 的隐式无界性显式化并修正，理论上把 KL 正则真正落回目标函数，而非靠早停间接约束。
