# RoPE旋转位置编码

> 对应 Su et al., *RoFormer: Rotary Position Embedding*, 2021（提出 RoPE，并被 LLaMA 等广泛采用）。

## 一、背景与挑战

需一种既能表达绝对位置、又使注意力分数仅依赖相对位置的编码，并支持长度外推。

## 二、核心原理

把 query/key 按位置 $m$ 在二维子空间旋转角度 $m\theta$，使内积 $\langle R_m q, R_n k\rangle$ 只依赖相对差 $n-m$。

## 三、数学形式

$R_m=\mathrm{diag}(e^{im\theta_1},e^{-im\theta_1},\dots)$；分数 $\langle R_m q,R_n k\rangle = q^\top R_{n-m} k$，天然相对性。

## 四、代码实现

```python
def rope(x, theta):
    # x: [..., d], 分奇偶对旋转
    return x * cos(m*theta) + rotate_half(x) * sin(m*theta)
```

## 五、与其他对比

- 相对绝对编码：RoPE 在旋转中隐式编码绝对、分数中显相对。
- 与 ALiBi 相比，RoPE 靠旋转、ALiBi 靠线性偏置，外推策略不同。

## 六、常见误区

- 误以为 RoPE 是加性位置；它是乘性旋转，不能简单与嵌入相加。
- 忽略基频 $\theta$ 设置对长外推的影响（NTK-aware 可缓解）。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- RoPE 为何分数只依赖相对位置？答：旋转矩阵乘积 $R_m^\top R_n=R_{n-m}$，内积退化为相对角差。

## 九、演进

绝对/相对 → RoPE（2021）→ NTK-aware/动态外推（2023+）。

## 十、小结

RoPE 以旋转把绝对位置编码为相对可感知，是现代 LLM 主流位置方案。
