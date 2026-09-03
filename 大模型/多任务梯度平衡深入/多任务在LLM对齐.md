# 多任务梯度平衡在 LLM 对齐

> 对应 指令微调多任务与 RLHF 多目标；以及多目标奖励（见奖励模型深入）。

## 一、背景与挑战

LLM 同时学多指令任务与对齐目标（有用/无害），梯度需平衡防偏。

## 二、核心原理

指令 SFT 多任务可用 GradNorm/不确定加权；RLHF 中奖励多属性加权等价于多任务平衡。

## 三、数学形式

对齐总损失 $\mathcal L = \mathcal L_{SFT} + \beta \mathcal L_{pref}$ 与多属性 $w_1r_h+w_2r_s$。

## 四、代码实现

```python
loss = sft_loss + beta * dpo_loss
loss.backward()                       # 必要时 PCGrad 解冲突
```

## 五、与其他对比

- 与 直接偏好优化深入（偏好目标）共享。
- 与 多任务梯度平衡总览 衔接。

## 六、常见误区

- SFT 与偏好损失尺度差大未平衡。
- 多属性奖励未归一致某属性主导。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- LLM 对齐为何要多任务平衡？答：SFT 与偏好/多属性目标尺度冲突，需平衡防单一目标主导。

## 九、演进

单目标 SFT → SFT+偏好 → 多属性梯度平衡。

## 十、小结

LLM 对齐本质多任务，梯度平衡保障各目标协调提升。
