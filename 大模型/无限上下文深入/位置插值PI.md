# 位置插值 PI

> 对应 Chen et al. (kaiokendev / Meta), *Extending Context Window of LLMs via Positional Interpolation*, 2023。

## 一、背景与挑战

直接外推位置到远超训练范围会使模型落在未训练分布，困惑度骤升。

## 二、核心原理

位置插值把测试位置区间 $[0,L']$ 线性压缩到训练区间 $[0,L]$：$f(i)=i\cdot L/L'$，使新位置落入模型已见过的编码范围；只需极少微调即可适配更长的上下文。

## 三、数学形式

对 RoPE：测试时旋转角改用 $\theta'_i=\theta_{i/s}$，$s=L'/L$；则 $R_{i}'=R_{i/s}$，落在训练分布。等价 NTK 缩放亦基于此思想。

## 四、代码实现

```python
def rope_pi(x, scale):
    inv = 1.0 / (base ** (arange(0, d, 2) / d)) / scale   # 缩放频率
    return apply_rotary(x, torch.cos(torch.outer(arange(n), inv)),
                          torch.sin(torch.outer(arange(n), inv)))
```

## 五、与其他对比

- 与 相对位置编码深入 的 NTK/PI 节直接对应。
- 与 ALiBi（下节）是两种不同的外推哲学。

## 六、常见误区

- 过度压缩丢失局部精细位置区分。
- 不微调直接推理仍可能退化，需少量适配。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 位置插值为什么有效？答：把更长位置压回训练所见范围，避免分布外。

## 九、演进

直接外推 → 线性插值(PI) → NTK-aware/动态缩放。

## 十、小结

PI 以最小改动扩展上下文，是低成本长上下文方案的代表。
