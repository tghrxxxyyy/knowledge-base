# Q-Former 对齐

> 见「多模态对齐深入/BLIP与图文理解」。

## 一、背景与挑战

直接拼接视觉特征到 LLM 信息冗余且低效。Q-Former 充当「瓶颈」提取最有用视觉表征。

## 二、核心原理

一组可学习 query 通过交叉注意力从视觉编码器抽取信息，再输入 LLM。三阶段训练：图文对齐、图文匹配、语言生成。

## 三、关键要点

- query 数远小于视觉 token，压缩信息。
- 冻结 LLM 仅训 Q-Former 即可接入。

## 四、代码实现

```python
# 简化：可学习 query 交叉注意力视觉
q = self.cross_attn(query, visual_feat)
```

## 五、与其他对比

- 比线性投影保留更多结构化交互。

## 六、常见误区

- query 太多失去瓶颈意义，太少丢信息。

## 七、与开源书对应

- BLIP-2: https://github.com/salesforce/LAVIS
- Li et al., *BLIP-2*, 2023.

## 八、面试题

- Q-Former 为何被称为「瓶颈」？

## 九、演进

线性投影 → Q-Former → Perceiver 类架构。

## 十、小结

Q-Former 高效桥接视觉与语言大模型。
