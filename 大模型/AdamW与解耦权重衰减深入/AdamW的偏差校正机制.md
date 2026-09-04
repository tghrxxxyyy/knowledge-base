# AdamW的偏差校正机制

> 对应 Kingma & Ba 2015 Adam (arXiv:1412.6980) 与 Loshchilov & Hutter 2019 AdamW。

## 一、背景与挑战
Adam 用指数移动平均估计一阶矩 m 与二阶矩 v。训练初期 m、v 接近 0，导致步长被严重低估，需要偏差校正恢复无偏估计。

## 二、核心原理
对 m_t、v_t 除以 `(1-β^t)` 进行校正，使早期估计快速收敛到真实矩。AdamW 在解耦衰减前后都沿用该校正。

## 三、形式化与数学基础
$ \hat m_t = m_t / (1-\beta_1^t) $，$ \hat v_t = v_t / (1-\beta_2^t) $

更新：

$ \theta_{t+1} = (1-\eta\lambda)\theta_t - \eta \hat m_t/(\sqrt{\hat v_t}+\epsilon) $

## 四、代码实现
```python
# 偏差校正的关键
m = beta1 * m + (1 - beta1) * g
v = beta2 * v + (1 - beta2) * (g * g)
mhat = m / (1 - beta1 ** t)   # t 从 1 开始计数
vhat = v / (1 - beta2 ** t)
update = lr * mhat / (vhat.sqrt() + eps)
```

## 五、与其他技术对比
RMSProp 不设一阶矩、无校正；SGD 无此问题。偏差校正使 Adam 在首几步更稳定，避免早期更新幅度异常。

## 六、常见误区
误把 t 从 0 开始计数，使 `(1-β^0)` 分母为 0 导致除零或无限步长。

## 七、与开源书/权威来源对应
Kingma & Ba 2015 Adam 第 3 节；pytorch/pytorch 的 `Adam`/`AdamW` 实现使用 `bias_correction`。

## 八、面试题
问：为何需要偏差校正？答：EMA 初始偏低，校正补偿冷启动偏差。

## 九、演进与趋势
部分新优化器通过无偏二阶矩近似减少校正依赖，但 Adam 系仍普遍保留。

## 十、小结
偏差校正保证 AdamW 早期步长正确，是收敛稳定的隐性保障。
