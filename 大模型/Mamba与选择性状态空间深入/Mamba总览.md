# Mamba总览

> 对应 Gu & Dao, 2023 *Mamba: Linear-Time Sequence Modeling with Selective State Spaces*; Albert Gu 博士论文。

## 一、背景与挑战
Transformer 在长序列上 $O(L^2)$ 自注意力代价高。状态空间模型（SSM）以线性复杂度建模长程依赖。传统 SSM（LSSL、S4）输入无关，无法选择性记忆。Mamba 通过输入依赖的选择机制解决。

## 二、核心原理
Mamba 把 SSM 离散化参数 $\Delta, B, C$ 设为输入 $x$ 的函数：$h_t = \bar A h_{t-1} + \bar B x_t, y_t = C h_t$，其中 $\bar A, \bar B$ 由 $\Delta$ 控制离散化步长。选择机制让模型决定"记住"或"忘记"。

## 三、形式化与数学基础
连续 SSM：$h'(t) = A h(t) + B x(t), y(t) = C h(t)$。离散化（ZOH）：$\bar A = \exp(\Delta A), \bar B = (\Delta A)^{-1}(\exp(\Delta A)-I) \cdot \Delta B$。选择性：$\Delta = \text{softplus}(W_\Delta x), B = W_B x, C = W_C x$。

## 四、代码实现
```python
class MambaBlock(nn.Module):
    def __init__(self, d, d_state):
        super().__init__()
        self.in_proj = nn.Linear(d, 2*d)
        self.conv1d = nn.Conv1d(d, d, 3, padding=2)
        self.x_proj = nn.Linear(d, d_state*2 + 2*d_state)
        self.dt_proj = nn.Linear(d, d)
        self.A = nn.Parameter(torch.log(torch.arange(1, d_state+1).float()))
    def forward(self, x):
        xz = self.in_proj(x)
        x, z = xz.chunk(2, dim=-1)
        x = self.conv1d(x.transpose(1,2)).transpose(1,2)
        delta, B, C = self.x_proj(x).split([...], dim=-1)
        # SSM 扫描
        ...
```

## 五、与其他技术对比
- vs Transformer：复杂度 $O(Ld)$ vs $O(L^2 d)$。
- vs RWKV：Mamba 选择性更强，RWKV 固定衰减。
- vs 线性注意力：Mamba 是输入依赖的 SSM，线性注意力是核近似。

## 六、常见误区
- 误以为 Mamba 是 RNN；训练用并行扫描。
- 状态维度 $d_\text{state}$ 选 16/64，太小表达力不足。

## 七、与开源书/权威来源对应
- state-spaces/mamba 官方仓库。
- d2l-ai/d2l-zh 第10章。
- Albert Gu 2021 博士论文 *On the Expressivity and Length Generalization of Structured State Space Models*。

## 八、面试题
- Mamba 为何能选择性记忆？答：$\Delta, B, C$ 依赖输入，使模型自适应地保留/丢弃信息。

## 九、演进与趋势
S4 → H3 → Hyena → Mamba → Mamba2 → Jamba（混合架构）。

## 十、小结
Mamba 以输入依赖的状态空间实现线性复杂度的选择性序列建模，是 Transformer 的重要竞争者。
