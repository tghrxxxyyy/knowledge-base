# 批量编辑MEMIT

> 对应 Meng et al., *Mass-Editing Memory in a Transformer (MEMIT)*, ICLR 2023；Yao et al., *Editing LLMs: Problems, Methods and Opportunities*, EMNLP 2023。

## 一、背景与挑战

单条秩一编辑难以扩展：成百上千条事实逐条改写会累积干扰、互相覆盖。需要一次性求解多约束更新并分摊到多层。

## 二、核心原理

MEMIT 把多事实编辑写成多约束最小二乘，把残差按层分摊，逐层写入以降低单层扰动幅度。

- 多约束：把所有目标键值对堆成矩阵，求解使 $W'K^\ast\approx V^\ast$ 的最小改动。
- 分摊：将所需的值变化按选定的若干中间层平均分配，避免单层权重被过度拉扯。

## 三、数学形式

$$\Delta = (V^\ast - W K^\ast)\,\big(K^\ast\big)^{\top}\Big(C + K^\ast \big(K^\ast\big)^{\top}\Big)^{-1}$$

其中 $K^\ast\in\mathbb{R}^{d\times m}$ 为 $m$ 条事实的键矩阵；当 $m=1$ 且 $C$ 为白化协方差时退化为 ROME 的秩一解。

## 四、代码实现

```python
import torch
def memit_delta(W, K, V, C, lam=1e-2):
    A = C + K @ K.t() + lam * torch.eye(K.shape[0])
    return (V - W @ K) @ K.t() @ torch.inverse(A)
W = torch.randn(64, 128); K = torch.randn(128, 16); V = torch.randn(64, 16)
print(memit_delta(W, K, V, torch.eye(128)).shape)
```

## 五、与其他对比

- 与逐条 ROME 对照：联合求解显著减少事实间相互覆盖，批量规模可提升数个量级。
- 与持续学习对照：MEMIT 是离线批量改写，不解决在线流式编辑的漂移问题。

## 六、常见误区

- 批量越大越好：约束数超过有效秩后局部性迅速恶化，需分批与正则。
- 只评编辑成功率，不评通用能力基准是否回退。

## 七、与开源书对应

- d2l-zh（线性方程组与正则化最小二乘）：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course（模型维护与评测回归）：https://github.com/mlabonne/llm-course

## 八、面试题

- MEMIT 相对 ROME 的关键改进？答：多约束联合求解 + 跨层残差分摊，支持大批量编辑。
- 批量编辑的主要风险？答：干扰累积导致局部性与通用能力下降，需分批与回归测试。

## 九、演进

单事实秩一编辑 → 多约束批量求解 → 跨层分摊 → 序列/持续编辑与漂移治理。

## 十、小结

MEMIT 用最小二乘的批量视角解决编辑规模化，代价是必须严格监控干扰与回归。
