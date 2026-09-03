# InfoNCE 与表征学习

> 对应 Oord et al., 《CPC》, 2018；以及 Chen et al., SimCLR, 2020。

## 一、背景与挑战

无监督下需从数据中构造监督信号学通用表征；InfoNCE 把互信息最大化转为分类。

## 二、核心原理

把同一样本的不同视图（或时序邻居）作正对，批内其余作负；用交叉熵区分，等价于下界互信息。

## 三、数学形式

$\mathcal L_{InfoNCE} = -\mathbb E\left[\log \frac{\exp(s(q,k_+)/\tau)}{\sum_{i=0}^K \exp(s(q,k_i)/\tau)}\right]$。

## 四、代码实现

```python
logits = similarity(q, k) / temperature
loss = cross_entropy(logits, positive_index)
```

## 五、与其他对比

- 与 负采样策略深入（InfoNCE 是 NCE 分类化）同源。
- 与 对比与三元组损失深入 共享对比范式。

## 六、常见误区

- 温度 $\tau$ 过小过锐、过大过平滑。
- 批太小负样本不足致塌缩。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- InfoNCE 与互信息关系？答：其损失是互信息下界，最小化即最大化正负视图互信息。

## 九、演进

NCE → InfoNCE(CPC) → SimCLR/MOCO 大规模对比。

## 十、小结

InfoNCE 将互信息最大化化为分类，是当代自监督表征核心。
