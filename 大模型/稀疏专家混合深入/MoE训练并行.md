# MoE 训练并行

> 见「分布式训练」与「稀疏专家混合深入/MoE原理」。

## 一、背景与挑战

专家分布在多卡，路由跨设备通信重。

## 二、核心原理

专家并行（专家放不同设备）+ 数据并行，token 经 all-to-all 分发到专家设备再回收。

## 三、关键要点

- all-to-all 是通信瓶颈。
- 容量限制减通信。

## 四、代码实现

```python
dispatched = all_to_all(x, expert_ids); out = experts(dispatched)
```

## 五、与其他对比

- 纯数据并行简单；专家并行高效但通信重。

## 六、常见误区

- MoE 通信轻——all-to-all 很重。

## 七、与开源书对应

- Megatron-LM MoE; llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- MoE 训练的通信瓶颈？

## 九、演进

数据并行 → 专家并行 → 混合并行。

## 十、小结

并行是 MoE 训练的难点。
