# 二阶预条件优化器与 Adam 对比

> 对应 优化器比较实践；与 AdamW深入 / 二阶预条件优化器总览深入 衔接。

## 一、背景与挑战

Adam 是事实默认，但二阶预条件在收敛质量上可能更优，需权衡成本。

## 二、核心原理

Adam 用一阶矩/二阶矩逐元素缩放，近似对角预条件；Shampoo/KFAC 用矩阵级预条件捕捉结构。

## 三、数学形式

Adam：$\Delta\theta=-\eta\,\widehat m/(\sqrt{\widehat v}+\epsilon)$（对角）；Shampoo：矩阵逆平方根（非对角）。

## 四、代码实现

```python
# Adam: 对角自适应; Shampoo: 矩阵预条件
step_adam = lr*mhat/(vhat.sqrt()+eps)
```

## 五、与其他对比

- 二阶法在中小模型常更优，大模型受显存/算力限制仍多用 AdamW。
- 与 优化器状态分片深入 同属训练效率议题。

## 六、常见误区

- 认为 Adam 已“足够好”而拒绝二阶，错失收敛收益。
- 直接套二阶到大模型导致 OOM。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 何时用二阶预条件？答：算力/显存允许且追求更优收敛时；大模型常态仍 AdamW。

## 九、演进

SGD → Adam → Shampoo/KFAC 实用化。

## 十、小结

二阶预条件在收敛上胜过 Adam 的对角近似，但成本决定其适用边界。
