# TopK 与 ReLU SAE

> 对应 Gao et al., *Scaling SAEs*, 2024；Makhzani & Frey, *k-sparse autoencoders*, 2013.

## 一、背景与挑战

L1 稀疏对特征尺度敏感、调参难；TopK 稀疏直接限制激活数，更稳更可解释。

## 二、核心原理

TopK SAE 取编码器输出中最大的 $k$ 个（其余置零），硬性控制稀疏度；ReLU SAE 用 ReLU+L1 软稀疏。

## 三、数学形式

$f=TopK(ReLU(z),k)$ 仅保留 $\text{argsort}(z)[:k]$；重构 $\hat x=W_{dec}f+b_{dec}$。

## 四、代码实现

```python
def topk_encode(z, k):
    thr = z.kthvalue(z.numel()-k+1).values
    return z * (z >= thr)
f = topk_encode(relu(x @ W_enc.T + b_enc), k=32)
```

## 五、与其他对比

- TopK 比 L1 更易跨尺度、训练更稳。
- 与 稀疏自编码器深入 总览互补。

## 六、常见误区

- k 太大失去稀疏，太小欠拟合。
- TopK 阈值依赖批统计致推理不稳。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- TopK 相对 L1 优势？答：直接控激活数、尺度无关、训练更稳且特征更单义。

## 九、演进

L1 SAE → TopK SAE → 自适应 k。

## 十、小结

TopK 以硬性稀疏取代 L1，是大规模 SAE 的实用默认。
