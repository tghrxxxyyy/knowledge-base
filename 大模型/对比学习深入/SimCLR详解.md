# SimCLR 详解

> 见「对比学习深入/对比学习总览」。

## 一、背景与挑战

简单框架也能强表征，需大 batch 提供负例。

## 二、核心原理

同图两种增强→双塔编码→投影头→NT-Xent 对比；大 batch（4096）保证负例充足。

## 三、关键要点

- 强增强（裁剪+颜色）关键。
- 投影头提升、推理丢弃。

## 四、代码实现

```python
z1, z2 = proj(enc(aug(x))), proj(enc(aug(x)))
loss = nt_xent(z1, z2)
```

## 五、与其他对比

- MoCo 用字典解耦 batch 限制。

## 六、常见误区

- batch 小也行——负例不足效果骤降。

## 七、与开源书对应

- Chen et al., *SimCLR*, 2020.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 八、面试题

- SimCLR 为何依赖大 batch？

## 九、演进

SimCLR → v2(更深) → 半监督。

## 十、小结

SimCLR 证明简单即强大。
