# 权重矩阵SVD低秩近似

> 对应 pytorch/pytorch 的 SVD 工具与经典的低秩矩阵压缩方法。

## 一、背景与挑战

大模型参数主要来自巨大权重矩阵。若矩阵近似低秩，可用两个小矩阵乘积表示，显著减参。SVD 给出最优低秩近似。

## 二、核心原理

对权重 $ W\\in\\mathbb R^{m\\times n} $ 做 SVD，取前 r 个奇异值/向量重构，得到秩 r 近似 $ W_r $，参数量从 $ mn $ 降到 $ r(m+n) $。

## 三、形式化与数学基础

$ W=U\\Sigma V^\\top\\approx U_{:, :r}\\Sigma_{:r, :r}V^\\top_{:r, :} $

 Eckart-Young 定理保证该截断在 Frobenius 范数下最优：

$ \\min_{\\text{rank}(\\hat W)\\le r}\\|W-\\hat W\\|_F=\\sqrt{\\sum_{i>r}\\sigma_i^2} $

## 四、代码实现

```python
import torch

def lowrank_svd(W, r=8):
    U, S, V = torch.svd(W)
    Ur, Sr, Vr = U[:, :r], torch.diag(S[:r]), V[:, :r]
    return Ur @ Sr @ Vr.t()           # 重构, 参数 r(m+n)

# 也可直接分解为 A=Ur*Sr^0.5, B=Sr^0.5*Vr^T 以便前向
```

## 五、与其他技术对比

- 比剪枝更结构化，直接降秩；但可能损伤重要奇异方向。
- 与 LoRA 同构但目的不同：SVD 为压缩，LoRA 为训练适配。

## 六、常见误区

- 对所有层用同一 r；注意层间秩差异。
- 忽略 SVD 的相位/符号不确定性影响收敛。

## 七、与开源书/权威来源对应

- pytorch/pytorch: https://github.com/pytorch/pytorch
- huggingface/transformers: https://github.com/huggingface/transformers
- mlabonne/llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- 为什么 SVD 截断是最优低秩近似？
- 低秩分解参数量如何变化？
- 低秩与剪枝区别？

## 九、演进与趋势

训练时联合低秩约束 (factorized training) 与量化-低秩联合压缩是方向。

## 十、小结

SVD 提供理论最优低秩压缩，是张量压缩的数学基础，但需按层选秩。
