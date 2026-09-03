# QK与OV电路分解

> 对应 Elhage et al., *A Mathematical Framework for Transformer Circuits*, 2021。

## 一、背景与挑战

单看 $W_Q,W_K,W_V,W_O$ 四个矩阵难以解释头的功能。把它们按功能配对合并，能得到两个语义清晰的有效算子。

## 二、核心原理

一个注意力头的行为可完全由「往哪看」和「搬什么」两部分描述，分别对应 QK 与 OV 电路。

- QK 电路 $W_{QK}=W_QW_K^\top$ 决定注意力模式，是作用在残差流上的双线性形式。
- OV 电路 $W_{OV}=W_OW_V$ 决定被搬运的内容如何写回残差流，与注意力权重解耦。

## 三、数学形式

$$A_{ij}=\mathrm{softmax}_j\!\left(\frac{x_i^{\top}W_{QK}\,x_j}{\sqrt{d_k}}\right),\qquad \text{head out}_i=\sum_j A_{ij}\,W_{OV}\,x_j$$

进一步可考察端到端有效矩阵 $W_U W_{OV} W_E$，它直接给出「输入 token 经该头影响输出 token」的完整通路。

## 四、代码实现

```python
import torch
def qk_ov(W_Q, W_K, W_V, W_O):
    return W_Q @ W_K.t(), W_O @ W_V                 # [d,d] 两个有效算子
W_Q, W_K = torch.randn(8, 4), torch.randn(8, 4)
W_V, W_O = torch.randn(8, 4), torch.randn(4, 8)
print([m.shape for m in qk_ov(W_Q, W_K, W_V, W_O.t())])
```

## 五、与其他对比

- 与逐矩阵分析对照：合并后参数化冗余（旋转不变性）被消除，解释更稳定。
- 与 归纳头与复制回路 衔接：归纳头的解释正是 QK 做匹配、OV 做复制。

## 六、常见误区

- 单独解释 $W_Q$ 或 $W_K$；它们只在乘积中有意义，单独的基底可任意旋转。
- 忽略头组合（Q/K/V-composition），把跨层协作误当单头能力。

## 七、与开源书对应

- harvardnlp/annotated-transformer（QKV 投影与输出投影的逐行实现）：https://github.com/harvardnlp/annotated-transformer
- d2l-zh（双线性形式与矩阵分解基础）：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为什么合并成 QK/OV？答：消除旋转冗余，得到「看哪里」与「搬什么」两个可解释算子。
- 端到端有效矩阵有什么用？答：直接刻画输入 token 到输出 logit 的单头通路。

## 九、演进

四矩阵视角 → QK/OV 合并（2021）→ 头组合分析 → 端到端有效权重解释。

## 十、小结

QK 与 OV 的分解让注意力头从四个矩阵变成两个可解释算子，是回路分析的标准语言。
