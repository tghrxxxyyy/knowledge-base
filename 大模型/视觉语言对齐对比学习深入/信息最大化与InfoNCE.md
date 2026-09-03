# 信息最大化与InfoNCE

> 对应 van den Oord et al., 2018（CPC 把互信息下界作为目标）；神经信息论视角。

## 一、背景与挑战

对比损失的理论动机是什么？InfoNCE 可被解释为对互信息 $I(x;c)$ 的噪声对比下界（NCE）估计。

## 二、核心原理

把“上下文 c 预测未来 x”视为分类：在 $K$ 个候选中选真样本。最大化该分类准确率等价于最大化 $I(x;c)$ 的下界，因此对比学习是在做表示空间的信息最大化。

## 三、数学形式

互信息下界：

$$I(x;c) \ge \log K - \mathcal L_{NCE}$$

当 $K\to\infty$ 时下界趋近真实互信息；$\mathcal L_{NCE}$ 即前述 InfoNCE。

## 四、代码实现

```python
# 信息最大化视角：增大正负得分差
pos = (v * t).sum(-1) / tau
neg = (v @ t_all.T).max(-1).values / tau
loss = -(pos - neg).mean()
```

## 五、与其他对比

- 与 对比学习总览 互补，本篇给理论解释。
- 与 表征学习/自监督 共享互信息目标。

## 六、常见误区

- 误以为 $K$ 越大越好；$K$ 受显存与batch限制，且下界松紧依赖负采样质量。
- 忽视 $I(x;c)$ 下界不等于表示线性可分性。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- InfoNCE 与互信息关系？答：它是 $I(x;c)$ 的对比下界，分类越准下界越高。

## 九、演进

NCE → InfoNCE → 多视角互信息 → 层次互信息。

## 十、小结

InfoNCE 本质是互信息下界最大化，为对比学习提供信息论根基。
