# 结果验证器（ORM）

> 对应 Cobbe et al., 2021（原称 verifier / outcomes）。

## 一、背景与挑战

只看最终答案对错，简单但漏过程错误。

## 二、核心原理

ORM 输入(问题,完整解答)输出[0,1]正确概率；训练用带标解答；best-of-n 选最高分。

## 三、数学形式

$P(correct|x,y)=\sigma(v_\phi(x,y))$；选 $y^*=\arg\max_y v_\phi(x,y)$。

## 四、代码实现

```python
best = max(samples, key=lambda y: orm(x, y))
```

## 五、与其他对比

- 与 过程验证器深入（PRM）对照粒度。
- 与 可验证奖励深入（结果校验）衔接。

## 六、常见误区

- 终答对但推理错仍被选（假正确）。
- ORM 不定位错误步。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- ORM 局限？答：只看结果，漏过程错、不定位。

## 九、演进

二值 → 概率 ORM → 与搜索结合。

## 十、小结

ORM 简单可用，但粒度粗、易假正确。
