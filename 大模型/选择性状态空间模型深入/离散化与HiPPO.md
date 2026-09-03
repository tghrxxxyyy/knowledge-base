# 离散化与HiPPO

> 对应 Gu et al., *HiPPO: Recurrent Memory for Optimal Compression*, 2020 与 S4 2021。

## 一、背景与挑战

连续系统需离散化才能在离散 token 上计算；同时需让状态更好地记住历史（记忆压缩）。

## 二、核心原理

用零阶保持离散化 $\bar A=e^{\Delta A},\ \bar B=(\Delta A)^{-1}(e^{\Delta A}-I)\Delta B$；HiPPO 给出使状态近似历史投影的 $A$。

## 三、数学形式

$e^{\Delta A}$ 用矩阵指数；HiPPO 的 $A$ 为特定下三角（Legendre 等），使 $x_k$ 编码前 $k$ 步最优低秩历史。

## 四、代码实现

```python
import scipy.linalg as sla
Abar = sla.expm(Delta * A)
Bbar = sla.solve(Delta * A, Abar - I) @ (Delta * B)
```

## 五、与其他对比

- 离散化是连接连续 SSM 与离散序列的桥梁。
- 与 状态空间对偶与Mamba2深入 共享离散化框架，但 Mamba2 走 SSD。

## 六、常见误区

- 用前向欧拉近似 $e^{\Delta A}$ 误差大，长序列不稳。
- 忽略 $\Delta$ 的输入依赖（Mamba 才引入）使 S4 时间尺度固定。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- HiPPO 解决什么？答：给出结构化 $A$ 让状态以最优低秩方式压缩历史，增强长程记忆。

## 九、演进

欧拉离散 → 精确指数离散 → HiPPO 结构化 A。

## 十、小结

离散化+HiPPO 让 SSM 在离散序列上既高效又具强历史记忆。
