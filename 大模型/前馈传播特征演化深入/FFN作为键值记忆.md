# FFN作为键值记忆

> 对应 Geva et al., *Transformer Feed-Forward Layers Are Key-Value Memories*, 2020。

## 一、背景与挑战

需验证 FFN 中间神经元是否对应可解释"概念键"，以支撑后续知识编辑。

## 二、核心原理

实验表明：某些中间神经元对特定实体/关系高激活（如"法国"相关键），其对应输出值携带相关信息。通过最大化/抑制该神经元可探其语义。

## 三、数学形式

激活贡献分解：$v_i = \phi((W_1)_{i:}x)\cdot (W_2)_{:,i}$；对输出 $y$ 的贡献为 $\langle v_i, y\rangle$ 经 $W_2$ 缩放。

## 四、代码实现

```python
pre = W1 @ x + b1
act = torch.relu(pre)
contrib = act.unsqueeze(1) * W2  # 每个神经元对输出的贡献向量
top = contrib.norm(dim=1).argsort(descending=True)[:5]
```

## 五、与其他对比

- 与 知识神经元深入（Dai 2021）同源，角度不同。
- 与 因果干预与激活修补深入 衔接（编辑记忆）。

## 六、常见误区

- 一个神经元只对应一个概念；实际常多义叠加。
- 局部改写常被邻近神经元抵消。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 如何证明某 FFN 神经元是"键"？答：消融/最大化该神经元并观察输出语义是否稳定对应某概念。

## 九、演进

关联分析 → 因果验证 → 受控编辑（ROME）。

## 十、小结

FFN 键值记忆解释为知识定位与编辑提供可操作接口。
