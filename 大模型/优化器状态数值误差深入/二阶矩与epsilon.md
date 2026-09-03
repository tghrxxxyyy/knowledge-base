# 二阶矩与 epsilon 数值

> 对应 Kingma & Ba, 2015（Adam 的二阶矩 $\hat v$ 与 $\epsilon$）。

## 一、背景与挑战

二阶矩 $\hat v$（梯度平方的滑动均值）出现在分母，作逐元素学习率缩放。其值近 0 时除以 0，需 $\epsilon$ 保护。

$\epsilon$ 大小影响小数梯度参数的更新幅度与数值安全。

## 二、核心原理

更新步长 $\propto \hat m_t/(\sqrt{\hat v_t}+\epsilon)$。$\epsilon$ 防除零并压制极小 $\hat v$ 导致的巨步；过大则近似 SGD 失去自适应。

混合精度下 $\hat v$ 若 FP16，平方梯度易下溢为 0，使步长失控。

## 三、数学形式

步长元素 $\Delta_i=\eta\frac{\hat m_{t,i}}{\sqrt{\hat v_{t,i}}+\epsilon}$；$\epsilon$ 常用 1e-8（FP32）或 1e-6（FP16/BF16 适配）。

## 四、代码实现

```python
denom = (vhat.sqrt() + eps)
update = lr * mhat / denom
```

## 五、与其他对比

- 与 一阶动量数值 衔接，二者合成步长。
- 与 数值下溢与防御 同防除零/下溢。
- 与 混合精度溢出检测深入 衔接，BF16 下 epsilon 常调大。

## 六、常见误区

- epsilon 过大退化为 SGD，失自适应。
- 低精度下 epsilon 过小，平方梯度下溢致巨步。
- 误把 eps 当作学习率正则而随意调。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- epsilon 起什么作用？答：防二阶矩近零时除零，并压制极小梯度参数的巨步。
- 为何 BF16 下 epsilon 调大？答：低精度平方梯度易下溢，需更大 eps 保分母稳定。

## 九、演进

eps=1e-8 → 低精度调 1e-6 → 自适应 epsilon 研究。

## 十、小结

二阶矩与 epsilon 决定 Adam 自适应的分母稳定性，低精度下需调大 epsilon。
