# SmoothQuant与AWQ的关系

> 对应 Xiao 2023 SmoothQuant 与 Lin 2023 AWQ 的权重-激活均衡方法对照。

## 一、背景与挑战

SmoothQuant 与 AWQ 都通过"权重-激活均衡"改善量化，常被混淆。厘清关系有助于正确选型。

## 二、核心原理

二者数学形式几乎相同（$ \\tilde W=\\text{diag}(s)W,\\tilde X=X\\text{diag}(s)^{-1} $），区别在于目标位宽与缩放依据：SmoothQuant 为 W8A8，依据激活/权重最大幅度的 $ \\alpha $ 平衡；AWQ 为 W4A16，依据激活显著性保护关键权重。

## 三、形式化与数学基础

SmoothQuant：

$ s_j=\\max(|X_j|)^\\alpha/\\max(|W_j|)^{1-\\alpha} $

AWQ：

$ s_j=\\left(\\frac1n\\sum_i|x_{ij}|^\\alpha\\right)^{1/\\alpha} $

前者重"平衡量化难度"，后者重"显著性保护"。

## 四、代码实现

```python
# 二者共享同一变换骨架, 仅 s 的求法不同
def balance_transform(W, X, s):
    return W * s, X / s   # 前向不变

# SmoothQuant 用 max 平衡; AWQ 用均值显著性, 见各自文档
```

## 五、与其他技术对比

- 目标互补：SmoothQuant 解决激活侧 8bit；AWQ 解决权重侧 4bit。
- 可串联：先 SmoothQuant 做 W8A8，或 AWQ 做 W4，二者不冲突。

## 六、常见误区

- 以为二者互斥或完全相同；实为同源不同目标。
- 把 AWQ 的激活缩放当成 SmoothQuant 的 W8A8 方案。

## 七、与开源书/权威来源对应

- Xiao et al. 2023, SmoothQuant.
- Lin et al. 2023, AWQ.
- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp

## 八、面试题

- SmoothQuant 与 AWQ 的变换为何相同？
- 二者在目标位宽上有何根本差异？
- 能否同时使用？

## 九、演进与趋势

统一均衡框架同时覆盖 W4A16 与 W8A8 是工程趋势。

## 十、小结

SmoothQuant 与 AWQ 同源异构：同一等价变换，不同缩放准则与位宽目标。
