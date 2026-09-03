# 在线与离线 RLHF

> 对应离线偏好优化（离线 DPO）、在线采样 RLHF（PPO 在线）；偏好优化前沿 衔接。

## 一、背景与挑战

在线 RLHF 每步需实时生成并打分（贵、不稳）；离线用固定偏好集更省但易偏离当前策略。

## 二、核心原理

在线：策略实时采样、RM 打分、更新，分布随策略变。离线：在静态偏好集上优化（如 DPO），不需在线生成。

## 三、数学形式

在线分布 $D_t$ 随 $\pi_t$ 变；离线固定 $D_{static}$；二者在分布覆盖上权衡。

## 四、代码实现

```python
# 在线：每个 PPO step 重新生成
# 离线：固定 pref 数据集跑 DPO
dpo_step(policy, ref, prefs_static)
```

## 五、与其他对比

- 与 直接偏好优化深入（典型离线）对照。
- 与 推理优化（采样成本）相关。

## 六、常见误区

- 离线数据分布过旧致偏离当前策略。
- 在线成本被低估（每步生成）。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：在线 vs 离线 RLHF？答：在线分布随策略更新更准但贵；离线省但需数据覆盖当前策略。

## 九、演进

纯在线 PPO → 离线 DPO → 在线-离线混合（迭代 DPO）。

## 十、小结

在线-离线是 RLHF 成本/精度权衡，混合迭代渐成主流。
