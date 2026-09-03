# MoE训练与推理

> 综合 Shazeer 2017、Fedus 2021、DeepSeek-V2/V3 的 MoE 工程实践。

## 一、背景与挑战

MoE 训练需均衡与稳定，推理需解决专家并行通信与内存占用；落地有独特工程难点。

## 二、核心原理

训练加辅助损失+容量限制；推理按层做专家并行（all-to-all 通信），或用共享专家+路由专家混合减少通信。

## 三、数学形式

显存 $\approx E\times|\text{expert}|$ 常驻；每步通信量来自 token 在设备间经路由重分配（all-to-all）。

## 四、代码实现

```python
dispatched = all_to_all(x, expert_assignment)
out = experts(dispatched)
y = all_to_all_back(out)
```

## 五、与其他对比

- 与 参数高效微调深入 不同：MoE 是结构级稀疏而非适配层。
- 与 推理调度深入 / 连续批处理深入 相关（专家并行调度）。

## 六、常见误区

- 以为 MoE 推理省显存；专家权重常全驻显存，仅激活计算省。
- 忽视 all-to-all 通信成带宽瓶颈。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- MoE 推理真省资源吗？答：省单 token 计算但专家权重常全驻显存，且通信开销大。

## 九、演进

稠密训练 → 稀疏 MoE 训练 → 细粒度+共享专家+通信优化。

## 十、小结

MoE 训练靠均衡正则，推理靠专家并行与通信优化，工程门槛高于稠密。
