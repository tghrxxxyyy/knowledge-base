# Mamba的选择性扫描

> 对应 Gu & Dao 2023；state-spaces/mamba 实现。

## 一、背景与挑战
Mamba 的关键创新是让 SSM 参数 $\Delta, B, C$ 依赖输入。如何高效地并行实现这种"逐 token 变化"的递推？

## 二、核心原理
传统 SSM 扫描是 $h_t = A h_{t-1} + B x_t$（A, B 常数），可并行；选择性版本 $A_t, B_t$ 随 $t$ 变化，需用 associative scan：操作 $\otimes$ 满足结合律，则可并行 prefix scan。

## 三、形式化与数学基础
$ (A_1, b_1) \otimes (A_2, b_2) = (A_2 A_1, A_2 b_1 + b_2) $，表示先作用第一段再作用第二段。结合律允许并行扫描。$A_t$ 通常对角，复杂度 $O(\log L)$ 层并行。

## 四、代码实现
```python
# 选择性扫描伪代码
def selective_scan(x, delta, A, B, C):
    # A: (D, N), B: (L, N), C: (L, N), delta: (L, D)
    dA = torch.exp(torch.einsum('ld,dn->ldn', delta, A))
    dB = torch.einsum('ld,ln->ldn', delta, B)
    # 关联扫描
    h = associative_scan(lambda a,b: (a[0]*b[0], a[0]*b[1]+a[1]), (dA, dB*x.unsqueeze(-1)))
    y = (h[1] * C.unsqueeze(-2)).sum(-1)
    return y
```

## 五、与其他技术对比
- vs RWKV：Mamba 状态矩阵 A 是逐 token 变化，RWKV 固定。
- vs Transformer：Mamba 扫描替代注意力矩阵。

## 六、常见误区
- 自定义 CUDA kernel 是性能关键；纯 Python 太慢。
- 离散化方法（ZOH vs Bilinear）影响稳定性。

## 七、与开源书/权威来源对应
- state-spaces/mamba `selective_scan` kernel。
- Dao-AILab/flash-attention 类似的高效 kernel 设计。

## 八、面试题
- 选择性扫描为何可并行？答：状态更新满足结合律。

## 九、演进与趋势
RNN → 并行扫描 → 选择性扫描 → Mamba2（SSD 框架）。

## 十、小结
选择性扫描是 Mamba 高效训练的核心，需要结合律的并行算法。
