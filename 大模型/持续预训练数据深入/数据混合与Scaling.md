# 继续预训练数据Scaling

> 对应数据规模定律（Hoffmann et al., *Chinchilla*, 2022）；大模型Scaling规律 衔接。

## 一、背景与挑战

继续预训该喂多少新数据？边际收益随规模递减需量化。

## 二、核心原理

在固定算力下，数据量随模型规模优化；继续预训亦存 data-model 平衡，过多旧数据稀释新领域。

## 三、数学形式

Chinchilla：$C\approx6ND$，最优 $N,D$ 同 scaling；继续预训新数据量 $D_{new}\propto N$。

## 四、代码实现

```python
epochs = estimate_epochs(model_size, avail_tokens)  # 控新数据曝光
```

## 五、与其他对比

- 与 预训练数据规模深入（原预训）对照。
- 与 计算最优深入（算力分配）共享。

## 六、常见误区

- 新数据 epoch 过多致过拟合。
- 忽视旧数据最小保留量。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 问：继续预训数据量如何定？答：按模型规模与算力，循 Chinchilla 式平衡，兼顾新领域与旧能力。

## 九、演进

经验量 → scaling law 指导 → 动态停止。

## 十、小结

继续预训数据规模需 scaling 指导，避免过/欠训。
