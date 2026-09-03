# 块稀疏与 BigBird

> 对应 Zaheer et al., *Big Bird: Transformers for Longer Sequences*, 2020。

## 一、背景与挑战

如何在理论上保证稀疏模式仍能近似全注意力的表达力，并支持极长序列？

## 二、核心原理

BigBird 组合三种稀疏：随机稀疏（每个 token 连少量随机位）、局部窗口、全局 token；理论上证明该组合是全注意力的有效稀疏近似，且保持图连通性（信息可传递），复杂度 $O(n)$。

## 三、数学形式

边集 $E = E_{rand}\cup E_{local}\cup E_{global}$，$|E|=O(n\cdot r)$（$r$ 为每点连接数）；全局+随机保证任意两点经 $O(\log n)$ 跳可达。

## 四、代码实现

```python
mask = random_edges(n, r) | window_mask(n, w) | global_mask(n, g)
scores = scores.masked_fill(~mask, -inf)
```

## 五、与其他对比

- 与 Longformer 相比多了随机连接，理论连通性更好。
- 与 线性注意力深入 相比保留精确稀疏交互。

## 六、常见误区

- 随机边若不加全局，长程传递需多层。
- 实现随机边要固定 seed 以保证可复现。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- BigBird 为何需随机+全局？答：随机保证连通近似，全局提供锚点，二者补局部窗口之不足。

## 九、演进

窗口 → 窗口+全局 → 随机+窗口+全局(BigBird)。

## 十、小结

BigBird 以三类稀疏的理论组合，在线性复杂度下逼近全注意力表达力。
