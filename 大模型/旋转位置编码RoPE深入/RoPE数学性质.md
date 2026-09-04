# RoPE数学性质

> 对应 Su 2021 RoFormer 论文第3节。

## 一、背景与挑战
RoPE 不是黑盒，需要理解其数学性质才能在自定义模型中正确使用。关键性质是相对位置编码、长程衰减与远程衰减的边界。

## 二、核心原理
性质1：$\langle R_m q, R_n k \rangle = q^\top R_{n-m} k$，仅依赖 $m-n$。
性质2：$R_m$ 正交，$R_m^\top R_n = R_{n-m}$。
性质3：相对位置编码的形式 $f(m-n)$ 可被 RoPE 表示为 $2\cos((m-n)\theta)$ 项之和。

## 三、形式化与数学基础
利用复数表示 $q_{2i} + i q_{2i+1}$ 乘以 $e^{i m \theta_i}$，则内积 $\Re[(qe^{im\theta})(\bar k e^{-in\theta})] = \Re[qk^* e^{i(m-n)\theta}] = |qk^*| \cos((m-n)\theta + \phi)$。

## 四、代码实现
```python
# 复数视角的 RoPE
q_complex = torch.view_as_complex(q.float().reshape(B,H,L,D//2,2))
k_complex = torch.view_as_complex(k.float().reshape(B,H,L,D//2,2))
q_rot = q_complex * torch.exp(1j * m * theta)  # m: (L, D//2)
k_rot = k_complex * torch.exp(-1j * n * theta)
score = torch.view_as_real(q_rot * k_rot.conj()).sum(-1)
```

## 五、与其他技术对比
- vs T5 相对位置偏置：RoPE 通过旋转而非加偏置，参数更少。
- vs Sinusoidal：RoPE 对 $m-n$ 周期性强，外推需配合 NTK/YaRN。

## 六、常见误区
- 把 $\theta_i$ 设为 0 会使所有位置等价。
- 复数实现需注意 PyTorch 的 `view_as_complex` 要求最后一维为 2。

## 七、与开源书/权威来源对应
- Su 2021 RoFormer 论文。
- lucidrains/rotary-embedding-torch 库。

## 八、面试题
- RoPE 编码的相对位置是线性的吗？答：不是，是周期为 $2\pi/\theta_i$ 的余弦叠加。

## 九、演进与趋势
RoPE → RoPE-mixed（部分维度 RoPE，部分绝对）→ Theta scaling。

## 十、小结
RoPE 的数学性质是其在 LLM 中广泛应用的根基，复数视角是理解的关键。
