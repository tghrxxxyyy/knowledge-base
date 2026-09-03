# 动态 Token 预算

> 对应 per-token 计算分配；与 长上下文技术 衔接。

## 一、背景与挑战

序列中不同 token 重要性不同，均匀算力浪费于易位。

## 二、核心原理

对高信息/难预测 token 分配更多注意力层或步；可用置信或熵门控跳过某些 token 的深层计算。

## 三、数学形式

token 预算 $b_i\propto \text{entropy}(P(\cdot|h_i))$；总算 $\sum_i b_i\le B$。

## 四、代码实现

```python
skip = ent(logits) < thr          # 低熵 token 浅算
```

## 五、与其他对比

- 与 早退推理深入（样本级）相对，本篇 token 级。
- 与 稀疏注意力深入 互补。

## 六、常见误区

- 跳算错 token 致传播误差。
- 预算全局超支。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 动态 token 预算思想？答：按 token 不确定性分配算力，难预测者深算、易者浅算。

## 九、演进

样本级 → token 级 → 位置-头联合。

## 十、小结

动态 token 预算在序列内精细分配算力，进一步提效。
