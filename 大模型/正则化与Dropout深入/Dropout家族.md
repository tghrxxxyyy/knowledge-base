# Dropout家族

> 对应 Srivastava et al., *Dropout*, 2014；Gal & Ghahramani, *Dropout as Bayesian*, 2016。

## 一、背景与挑战

隐式集成防止神经元共适应；但推理需缩放，且需注意归一化交互。

## 二、核心原理

训练时以概率 $p$ 置零神经元，推理时乘 $1-p$（或反向缩放）。变体：Spatial Dropout、DropPath（随机深度）、Alpha Dropout（SELU）。

## 三、数学形式

期望近似：$y \approx (1-p)\tilde y$；DropPath 以概率 $p$ 整层/支路置零。

## 四、代码实现

```python
x = F.dropout(x, p=0.1, training=self.training)
x = drop_path(x, p=0.1)        # 随机深度
```

## 五、与其他对比

- DropPath 更适合深层/残差（按样本随机丢支路）。
- 与 残差连接深入 协同（残差使丢支路仍通畅）。

## 六、常见误区

- 推理忘记关 dropout 致输出缩放错。
- 与 BN 同用早期有冲突（训练和推断统计量差）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- DropPath 与 Dropout 区别？答：DropPath 按样本随机丢弃整条路径/层，更适合残差网络。

## 九、演进

Dropout → Spatial → DropPath/Stochastic Depth → 门控 dropout。

## 十、小结

Dropout 家族通过随机置零实现隐式集成，DropPath 是深层网络主力正则。
