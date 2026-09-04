# NaN与Inf的常见来源

> 对应 pytorch/pytorch 调试指南与 NVIDIA/TensorRT-LLM 数值稳定实践。

## 一、背景与挑战
大模型训练偶发 NaN/Inf 会使 loss 瞬间爆炸、参数永久损坏。快速定位来源是恢复训练的前提。

## 二、核心原理
常见根因：除零（如层归一化方差为零）、log(0)、exp 溢出、loss scaling 过大、非法输入（坏样本）、混合精度下溢/上溢。

## 三、形式化与数学基础
危险操作示例：`log(p)` 当 `p=0`；`x/var` 当 `var=0`；`exp(z)` 当 `z>88`（FP16）。这些在边界输入下产生 inf/NaN。

## 四、代码实现
```python
# 训练前 sanity：检测非有限输入
for x, y in loader:
    if not torch.isfinite(x).all() or not torch.isfinite(y).all():
        print("bad sample detected"); break
```

## 五、与其他技术对比
AdamW 本身数值稳；问题多来自注意力 softmax、归一化与混合精度交互。

## 六、常见误区
看到 NaN 就重训；应先定位是输入、前向还是优化器阶段。

## 七、与开源书/权威来源对应
pytorch/pytorch 关于非有限值的文档；NVIDIA/TensorRT-LLM 数值检查实践。

## 八、面试题
问：NaN 最常见的三来源？答：softmax 溢出、归一化除零、loss scaling 过大。

## 九、演进与趋势
自动 nan/inf 检测钩子（torch 的 `detect_anomaly`）辅助定位。

## 十、小结
系统排查输入→前向→反向→更新，是 NaN 定位的标准路径。
