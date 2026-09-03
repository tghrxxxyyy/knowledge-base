# MoCo 字典队列

> 见「对比学习深入/对比学习总览」与「对比学习深入/SimCLR详解」。

## 一、背景与挑战

大 batch 显存不够，负例不足。

## 二、核心原理

维护动量更新的编码器与队列（字典）存历史表征作负例，解耦负例数与 batch 大小。

## 三、数学形式

动量更新：

```
θ_k = m·θ_k + (1-m)·θ_q,  m≈0.999
```

## 四、代码实现

```python
queue = deque(maxlen=K)
k = momentum_encoder(x); queue.append(k.detach())
```

## 五、关键要点

- 动量编码器保一致性。
- 队列提供大量负例。

## 六、与其他对比

- SimCLR 靠大 batch；MoCo 靠队列。

## 七、常见误区

- 两个编码器参数相同——应动量更新。

## 八、与开源书对应

- He et al., *MoCo*, 2020.
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- MoCo 动量编码器作用？

## 十、演进

MoCo → MoCo v2/v3(ViT)。

## 十一、小结

MoCo 用小资源换大字典。
