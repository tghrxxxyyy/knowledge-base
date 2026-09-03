# Teacher Forcing与曝光偏差

> 对应 Bengio et al., *Scheduled Sampling*, 2015；Huszar, 2015。

## 一、背景与挑战

训练时用真值输入（teacher forcing）高效，但推理时模型用自身预测，分布偏移致错误累积。

## 二、核心原理

曝光偏差（exposure bias）：训练/推理输入分布不一致，一步错引发级联错。
缓解：scheduled sampling（逐步以概率用自身预测替代真值）、课程学习、对抗/强化训练。

## 三、数学形式

scheduled sampling 混合比例 $\epsilon_i$ 随训练衰减；目标变为 $\mathbb E[\log p(x_t|\hat x_{<t})]$。

## 四、代码实现

```python
use_model = torch.rand(batch) < epsilon
prev = torch.where(use_model, pred, gold)
```

## 五、与其他对比

- free-running 训练稳但慢且梯度不稳；scheduled sampling 折中。
- 扩散/流匹配无显式自回归曝光偏差（并行去噪）。

## 六、常见误区

- 以为 teacher forcing 必然最优；其掩盖了推理分布偏移。
- scheduled sampling 调度不当反伤收敛。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 什么是曝光偏差？答：训练用真值、推理用预测导致分布不一致、错误累积。

## 九、演进

teacher forcing → scheduled sampling → 课程/对抗 → 推理时搜索（beam）。

## 十、小结

曝光偏差揭示训练-推理鸿沟，是序列生成鲁棒性的经典问题与研究方向。
