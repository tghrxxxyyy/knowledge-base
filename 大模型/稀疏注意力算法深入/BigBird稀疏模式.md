# BigBird稀疏模式

> 对应 Zaheer et al., *Big Bird: Transformers for Longer Sequences*, NeurIPS 2020。

## 一、背景与挑战

需比滑窗更灵活且理论保证能近似全注意力的稀疏模式，以支持更长序列与更丰富连接。

## 二、核心原理

BigBird 组合三种稀疏：局部滑窗、全局 token、以及随机稀疏连接，三者叠加使任意两 token 经常数跳可达。

## 三、数学形式

每位置注意集合 $S_i=G\cup W_i\cup R_i$，$|G|\!+\!|W|\!+\!|R|=O(\sqrt n)$ 使整体 $O(n\sqrt n)$。

## 四、代码实现

```python
mask = global_mask | window_mask(L, w) | random_mask(L, r)
```

## 五、与其他对比

- 比 Longformer 多了随机连接，图连通性更好、近似更稳。
- 与 线性注意力近似方法深入 相比仍保留 softmax 与稀疏结构。

## 六、常见误区

- 随机掩码未固定导致训练/推理不一致（需可复现随机）。
- 认为随机连接带来噪声；其作用是保证全局可达性。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- BigBird 为何加随机连接？答：保证任意两点经常数跳可达，近似全注意力的连通性。

## 九、演进

滑窗 → 滑窗+全局+随机 → 证明稀疏可近似全注意力。

## 十、小结

BigBird 用局部+全局+随机三元稀疏，在长序列上兼顾效率与表达。
