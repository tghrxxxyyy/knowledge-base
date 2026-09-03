# VC 维与 Rademacher 复杂度

> 对应 d2l-zh；Vapnik 统计学习理论；Bartlett & Mendelson, 2002。

## 一、背景与挑战

如何定量界定「模型多复杂才安全」？

## 二、核心原理

- **VC 维**：最大可被任意二分的点数，衡量分类器能力；泛化界随 VC 维增长。
- **Rademacher 复杂度**：衡量假设类与随机噪声的拟合能力，更细致；界：
```
E[R] - R̂ ≤ O( Rademacher(H)/√n + √(log(1/δ)/n) )
```

## 三、数学形式

见上；n 为样本数，δ 为失败概率。

## 四、代码实现

```python
# Rademacher 多用于理论，工程少见直接计算
```

## 五、关键要点

- 界是宽松上界，不精确但定性指引。
- 神经网络 VC 维随参数爆炸，与实测泛化矛盾→需新理论。

## 六、与其他对比

- VC 维离散/二分类；Rademacher 连续/一般。

## 七、常见误区

- VC 界解释深度学习——过松。

## 八、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- Vapnik《Statistical Learning Theory》。

## 九、面试题

- VC 维与泛化界的关系？

## 十、演进

VC 维 → Rademacher → 谱/范数界。

## 十一、小结

复杂度界定「学不至于乱猜」。
