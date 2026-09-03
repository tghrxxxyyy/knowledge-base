# RLHF 中的 PPO 算法

> 对应 Schulman et al., *Proximal Policy Optimization*, 2017；PPO 对齐实现。

## 一、背景与挑战

策略梯度易训崩；PPO 用裁剪约束更新幅度，稳定 RL 微调。

## 二、核心原理

每步采回答、RM 给奖励、GAE 估优势，用裁剪目标更新策略；价值网络减方差；KL 作为奖励惩罚。

## 三、数学形式

裁剪目标 $L^{CLIP}=\mathbb E[\min(r_t A_t, \text{clip}(r_t,1-\epsilon,1+\epsilon)A_t)]$，$r_t=\frac{\pi_\theta}{\pi_{old}}$。

## 四、代码实现

```python
query_tensors = tok(prompts, return_tensors="pt")
response_tensors = model.generate(**query_tensors)
rewards = rm(query_tensors, response_tensors)
ppo.step(query_tensors, response_tensors, rewards)
```

## 五、与其他对比

- 与 直接偏好优化深入（无显式 RL）对照。
- 与 训练不稳定诊断深入（PPO 稳训）衔接。

## 六、常见误区

- 奖励未减基线致高方差。
- 忽视 KL 致分布漂移/黑客。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：PPO 裁剪作用？答：限制新旧策略比，防过大更新致训练崩溃。

## 九、演进

PG → TRPO → PPO → 带 KL 的 RLHF-PPO。

## 十、小结

PPO 以裁剪稳训成为 RLHF 默认优化器，但工程复杂。
