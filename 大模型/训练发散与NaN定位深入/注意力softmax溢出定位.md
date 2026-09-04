# 注意力softmax溢出定位

> 对应 Vaswani 2017 Transformer 与 Dao 2022 FlashAttention (arXiv:2205.14135)。

## 一、背景与挑战
注意力 `exp(QKᵀ/√d)` 在 FP16 下若 logits 过大（如未缩放或位置编码异常）会溢出为 inf，softmax 变 NaN。

## 二、核心原理
QKᵀ 幅值随序列长度与初始化增长；除以 `√d` 控制尺度。若某维度爆炸，max 减法失效，exp 溢出。

## 三、形式化与数学基础
$ a_{ij} = \exp((q_i k_j^\top)/√d - m_i) / Σ_j \exp(...) $

当 `(qkᵀ)/√d - m_i > 88` 在 FP16 即 inf；FlashAttention 通过在线 softmax 防止该溢出。

## 四、代码实现
```python
# 检查注意力 logits 范围
with torch.autocast(dtype=torch.float16):
    scores = Q @ K.transpose(-1, -2) / d**0.5
    print(scores.abs().max().item())   # 若 > 88 高危
```

## 五、与其他技术对比
朴素 attention 一次性算全表易溢出；FlashAttention 分块在线归一化，数值更稳且省显存。

## 六、常见误区
忽略 RoPE/位置编码引入的尺度漂移，使 logits 持续增大直到溢出。

## 七、与开源书/权威来源对应
Vaswani 2017 提出缩放点积；Dao 2022 FlashAttention 解决溢出与显存。

## 八、面试题
问：为何除以 √d？答：控制 QKᵀ 方差随维度线性增长，稳定 softmax 输入。

## 九、演进与趋势
在线 softmax 成为低精度注意力的标准实现。

## 十、小结
注意力 logits 尺度是 NaN 高发区，需监控与稳定化。
