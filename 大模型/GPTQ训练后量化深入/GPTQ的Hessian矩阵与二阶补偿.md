# GPTQ的Hessian矩阵与二阶补偿

> 对应 Frantar 2022 GPTQ (arXiv:2210.17323) 与 microsoft/DeepSpeed 的 ZeroQuant 思路。

## 一、背景与挑战

量化误差若逐元素独立处理，会高估总损失。Transformer 权重高度冗余，单列误差可通过其他列抵消。要利用这一冗余，需要度量各列对输出的联合影响，这正是 Hessian（二阶信息）的价值。

## 二、核心原理

GPTQ 用校准数据前向得到激活 $ X $，构造 $ H=XX^\\top $。Hessian 的逆刻画了"修正某一列后，应如何分摊误差到其余列"。补偿系数来自 $ H^{-1} $ 的对应列，使整体重建误差在二阶近似下保持最小。

## 三、形式化与数学基础

重建损失二阶展开：

$ \\mathcal L(\\Delta)\\approx \\tfrac12 \\Delta^\\top H \\Delta $

对第 j 列的量化扰动 $ \\delta_j $，最优全局修正为 $ \\Delta^*=-H^{-1}e_j\\delta_j $，其后续分量即补偿量

$ \\Delta_{i}=-H^{-1}_{i,j}\\delta_j/H_{j,j},\\quad i>j $

## 四、代码实现

```python
import torch

def estimate_hessian(X):
    # X: 校准激活 [n, in]
    H = X.t() @ X
    H += torch.eye(H.shape[0]) * 1e-6   # 阻尼，保证可逆
    return H

def compensate(Q, H, j, err, bits=4):
    qmax = 2 ** bits - 1
    scale = H[j, j] + 1e-12
    coef = (H[j+1:, j] / scale)
    Q[j+1:, :] -= (coef[:, None] * err)
    return Q

# 完整流程: 估算 H -> 逐列量化并补偿
```

## 五、与其他技术对比

- ZeroQuant 用逐层 Hutchinson 估计 Hessian，思路一致但更轻。
- AWQ 不显式算 Hessian，而是用激活幅度近似显著性。
- 量化感知训练以梯度代替 Hessian，信息更准但成本高。

## 六、常见误区

- 误以为 Hessian 必须精确求逆；实际用阻尼 + 分块即可。
- 校准集与真实分布偏移过大会使 $ H $ 失真。
- 把 $ H $ 当作逐元素权重重要性，忽略列间相关性。

## 七、与开源书/权威来源对应

- Frantar et al. 2022, GPTQ.
- Rasley et al. 2020, DeepSpeed ZeRO (https://github.com/microsoft/DeepSpeed)
- pytorch/pytorch: https://github.com/pytorch/pytorch

## 八、面试题

- 为什么二阶信息比一阶（幅度）更能反映量化重要性？
- Hessian 的阻尼项起什么作用？
- 校准集大小如何影响 GPTQ 质量？

## 九、演进与趋势

后续研究用低秩 Hessian 近似、在线校准集采样，进一步降低显存占用并提升跨域鲁棒性。

## 十、小结

Hessian 提供的二阶补偿是 GPTQ 精度的核心；理解它就能理解为何"顺序量化 + 补偿"优于独立量化。
