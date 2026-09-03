# 幻觉缓解RLHFV与LURE

> 对应 Yu et al. 2023 「RLHF-V」及 Zhou et al. 2023 「LURE」等多模态幻觉缓解工作。

## 一、背景与挑战

缓解幻觉需从数据与训练两端入手。RLHF-V 用细粒度人类反馈纠正错误；LURE 针对物体幻觉提出基于检索的反事实训练。挑战是反馈成本高、负样本构造难。

## 二、核心原理

RLHF-V 收集人类对 MLLM 输出的片段级反馈（哪句错），以 DPO/PPO 对齐，使模型在关键片段更守事实。LURE 利用图像检索找相似图，构造反事实负样本（图中无某物体）训练模型区分，降低凭空生成。

## 三、数学形式

DPO 目标：
L = -\log \sigma\left(\beta\log\frac{\pi_\theta(y_w\mid x)}{\pi_{ref}(y_w\mid x)} - \beta\log\frac{\pi_\theta(y_l\mid x)}{\pi_{ref}(y_l\mid x)}\right)
其中 y_w 为正确、y_l 为幻觉响应。LURE 以对比损失拉大真实与反事实物体得分差。

## 四、代码实现

```python
def dpo_loss(pi_theta, pi_ref, yw, yl, beta=0.1):
    lw = pi_theta(yw) - pi_ref(yw)
    ll = pi_theta(yl) - pi_ref(yl)
    return -torch.log(torch.sigmoid(beta*(lw-ll))).mean()
```

## 五、与其他对比

相比仅 SFT，RLHF-V 引入偏好信号更贴合人类判断；相比数据增广，LURE 显式建模反事实；二者常互补：先 LURE 降基础幻觉，再 RLHF-V 精细化。

## 六、常见误区

以为加数据即可解决幻觉；忽略反馈粒度（句级弱于片段级）；混淆 DPO 与 PPO 实现；未控制负样本质量。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：RLHF-V 贡献？答：片段级人类反馈对齐，减少幻觉。
- Q：LURE 思路？答：反事实负样本对比训练。
- Q：DPO 为何好用？答：不需奖励模型在线采样，稳定易训。

## 九、演进

从 RLHF 到 DPO/IPO 多目标；从物体到属性/关系幻觉；反馈自动化（模型互评）。

## 十、小结

RLHF-V 与 LURE 代表了「反馈 + 反事实」双轨缓解幻觉，是提升 MLLM 事实性的有效手段。
