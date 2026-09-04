# cosFormer与cosine注意力

> 对应 Qin et al., 2022 *cosFormer: Rethinking Softmax in Attention*。

## 一、背景与挑战
线性注意力常用 $\phi$ 近似 softmax，但存在训练不稳定与精度损失。cosFormer 提出基于余弦距离的可分解注意力，避免随机特征。

## 二、核心原理
令 $\phi(x) = \text{relu}(x)$，再在 $Q$ 与 $K$ 上乘以位置相关的余弦权重 $c_q, c_k$，使 $\phi(q_i c_q(i))^\top \phi(k_j c_k(j))$ 自然引入相对位置偏置。

## 三、形式化与数学基础
$ \text{cosAttn}(Q,K,V)_i = \frac{\phi(Q_i c_q(i)) \sum_{j\le i} \phi(K_j c_k(j)) v_j^\top}{\phi(Q_i c_q(i)) \sum_{j\le i} \phi(K_j c_k(j))} $，其中 $c_q(i)=\cos(i\pi/2), c_k(j)=\cos(j\pi/2)$，使 $c_q c_k$ 给出余弦相对位置。

## 四、代码实现
```python
cq = torch.cos(torch.arange(L)*math.pi/2)
ck = torch.cos(torch.arange(L)*math.pi/2)
Q_ = torch.relu(Q) * cq[:,None]
K_ = torch.relu(K) * ck[:,None]
S = K_.transpose(0,1) @ V
out = Q_ @ S / ((Q_ @ K_.sum(0))[None,:] + 1e-6)
```

## 五、与其他技术对比
- vs 线性注意力（elu+1）：cosFormer 训练更稳定，长程依赖更优。
- vs 标准注意力：复杂度线性，但精度略低。

## 六、常见误区
- 余弦权重未归一化导致尺度漂移。
- 同时使用 $\phi$ 与位置权重需重新推导归一化分母。

## 七、与开源书/权威来源对应
- ofwfanfan/cosFormer 官方实现。
- d2l-ai/d2l-zh。

## 八、面试题
- cosFormer 的相对位置偏置怎么来的？答：通过 $c_q(i) c_k(j) = \cos(i\pi/2)\cos(j\pi/2)$ 自然引入。

## 九、演进与趋势
线性注意力 → cosFormer → 与 RoPE 融合 → 状态空间。

## 十、小结
cosFormer 以余弦位置权重给线性注意力引入相对位置偏置，提升稳定性与长程建模能力。
