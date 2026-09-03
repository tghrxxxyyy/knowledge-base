# KV缓存优化总览

> 对应自回归推理 KV cache；与 注意力数学基础 / 自回归生成深入 衔接。

## 一、背景与挑战

自回归每步需历史 K/V，逐 token 重算贵；缓存 K/V 但显存随长度线性增长，成瓶颈。

## 二、核心原理

缓存各层历史 Key/Value，新 token 只算自身 Q 与缓存做注意力；优化在省显存/带宽（量化、分页、驱逐）。

## 三、数学形式

显存 $M = 2\cdot L\cdot n_{layers}\cdot d\cdot \text{bytes}$（$L$ 序列长）；优化降 $M$ 或精度。

## 四、代码实现

```python
past = []                  # 历史 K,V
for t in range(T):
    out, past = model.step(x_t, past)   # 增量更新
```

## 五、与其他对比

- 与 投机解码深入 / 连续批处理深入 共同决定推理效率。
- 与 长上下文技术（目录）强相关（长序列 KV 爆炸）。

## 六、常见误区

- 忽视 KV 显存成为长序列主要瓶颈。
- 缓存精度随意降致质量掉。

## 七、与开源书对应

- llm-course 推理：https://github.com/mlabonne/llm-course

## 八、面试题

- 为什么 KV 缓存显存随长度线性？答：需保存每历史位置每层的 K,V 向量。

## 九、演进

原始缓存 → 分页(PagedAttention) → 量化/驱逐。

## 十、小结

KV 缓存是自回归推理基石，其显存与带宽是长序列推理核心瓶颈。
