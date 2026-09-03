# FFN干预实证

> 对应 Meng et al., *Locating and Editing Factual Associations*, 2022（ROME）。

## 一、背景与挑战

能否直接修改 FFN 中的事实记忆而不伤整体能力？ROME 给出因果定位+局部编辑方案。

## 二、核心原理

先用因果追踪定位存储事实$(s,r,o)$的关键层与 FFN 键值；再用 rank-one 更新把目标"键"映射到新"值"，相当于重写一条记忆。

## 三、数学形式

编辑目标：找 $W_2^*$ 使 $W_2^* k_* = v_*$ 且 $\min\|W_2^*-W_2\|$，约束 $\|W_2^*-W_2\|_F$ 最小（闭式解）。

## 四、代码实现

```python
k = W1 @ h_star            # 触发键
delta = v_target - W2 @ k
W2_new = W2 + (delta @ k) / (k @ k)   # 秩一更新
```

## 五、与其他对比

- 与 知识神经元 衔接（同定位 FFN 记忆）。
- 与 因果干预与激活修补深入 共享因果方法。

## 六、常见误区

- 一次编辑可能牵连共享键的其他事实。
- 高层编辑易被后续层覆盖或放大。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- ROME 如何编辑事实？答：因果定位关键 FFN 键值，做秩一更新把触发键映射到新值。

## 九、演进

定位 → 单事实秩一编辑 → 批量/约束编辑（MEMIT）。

## 十、小结

FFN 干预实证表明事实记忆可定位改写，是可解释性走向可控的关键。
