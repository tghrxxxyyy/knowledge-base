# Adam变体（AMSGrad/LAMB）

> 对应 Reddi et al., *On the Convergence of Adam and Beyond (AMSGrad)*, ICLR 2018；You et al., *LAMB*, ICLR 2020。

## 一、背景与挑战

Adam 二阶矩可能震荡致不收敛；大批量下学习率难放大。

## 二、核心原理

AMSGrad 用二阶矩的最大值防止骤降，保证收敛性；LAMB 引入逐层信任比，使大批量可线性放大 LR。

## 三、数学形式

AMSGrad：$\hat v_t=\max(\hat v_{t-1},v_t)$。LAMB：信任比 $r=\frac{\|\theta\|}{\|\eta\hat m/\sqrt{\hat v}\|}$ 缩放更新。

## 四、代码实现

```python
v_hat = torch.maximum(v_hat, v)     # AMSGrad
update = r * (m / (v.sqrt()+eps))   # LAMB 信任比
```

## 五、与其他对比

- 与 Adam 兼容性高，主要修正收敛/大批量。
- 与 权重衰减深入（AdamW）可叠加。

## 六、常见误区

- AMSGrad 实践中增益有限，常非必需。
- LAMB 信任比对归一化层需谨慎。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- LAMB 解决什么问题？答：逐层信任比让大批量训练能放大数据，保持每层更新尺度合理。

## 九、演进

Adam → AMSGrad(收敛) → LAMB(大批量)。

## 十、小结

Adam 变体分别针对收敛证明与大规模扩展，是工程化补充。
