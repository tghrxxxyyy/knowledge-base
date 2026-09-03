# 量化感知训练（QAT）

> 对应 Jacob et al., *Quantization-aware Training*, 2018（伪量化）；Krishnamoorthi 综述。

## 一、背景与挑战

PTQ 在极低比特失效；QAT 在训练中模拟量化误差，让网络“适应”低比特。

## 二、核心原理

前向插入伪量化节点（FakeQuant）：量化再反量化引入误差；反向用直通估计（STE）传梯度，使权重分布易量化。

## 三、数学形式

伪量化 $\tilde w = s\cdot(\text{round}(w/s)-z)$；STE 设 $\frac{\partial \tilde w}{\partial w}=1$ 绕过不可导 round。

## 四、代码实现

```python
class FakeQuant(torch.autograd.Function):
    def forward(ctx,w,b): return quant(quant(w))   # 量-反量
    def backward(ctx,g): return g                  # STE
```

## 五、与其他对比

- 精度高于 PTQ，但需训练数据与算力。
- 与 模型压缩与稀疏量化深入（PTQ）对照。

## 六、常见误区

- 误用 STE 在大梯度处不稳定（可换 LSQ 学尺度）。
- QAT 后仍需 PTQ 导出最终整数模型。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- STE 作用？答：round 不可导，STE 让梯度直通，使量化误差可被训练补偿。

## 九、演进

PTQ → QAT → LSQ（学尺度）→ 低秩+量化。

## 十、小结

QAT 用伪量化+STE 换取极低比特精度，代价是训练成本。
