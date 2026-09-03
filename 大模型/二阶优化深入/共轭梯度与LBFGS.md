# 共轭梯度与L-BFGS

> 对应 Nocedal & Wright, 2006 的 L-BFGS；深度学习的拟牛顿应用。

## 一、背景与挑战

全记忆 BFGS 在海量参数内存不可行，L-BFGS 限制历史窗口。

## 二、核心原理

用最近若干梯度差与参数差构造逆 Hessian 近似，避免显式矩阵；配合线搜索。

## 三、数学形式

$H_k^{-1}\approx V_k^\top H_0 V_k+\sum \rho s s^\top$，其中 $s=\theta_{i+1}-\theta_i,\ y=g_{i+1}-g_i$。

## 四、代码实现

```python
from scipy.optimize import minimize
minimize(fun, theta, method='L-BFGS-B', jac=grad)
```

## 五、与其他对比

- 与 二阶优化深入 牛顿法相比无需 HVP。
- 与 自适应学习率深入 在凸/小数据场景竞争。

## 六、常见误区

- 深度学习非凸下 L-BFGS 线搜索易失败。
- 批量随机下历史 $y$ 噪声大，近似退化。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- L-BFGS 为何省内存？答：用有限历史梯度差近似逆 Hessian，避免存全矩阵。

## 九、演进

BFGS → L-BFGS → 在线 L-BFGS（SGD 风格）。

## 十、小结

拟牛顿以历史近似曲率，适合中小规模与确定性目标。
