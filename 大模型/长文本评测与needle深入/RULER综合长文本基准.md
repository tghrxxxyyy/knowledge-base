# RULER综合长文本基准

> 对应 Hsieh et al. 2024 "RULER: What's the Real Context Size of Your Long-Context Language Models?"。

## 一、背景与挑战

Needle 只测检索，RULER 扩展为多任务（检索、多跳追踪、聚合、问答），且随长度缩放。发现多数模型在 128k 时远低于宣称能力。

## 二、核心原理

四类任务按上下文长度动态生成，评测"有效上下文长度"：分数随长度下降明显的点即真实上限。RULER 比分长度恒定基准更敏感。

## 三、数学形式

有效长度（分数降至阈值）：

$$
L_{\mathrm{eff}}=\max\{L: \mathrm{Acc}(L)\ge \tau\}
$$

综合得分（长度平均）：

$$
S=\frac{1}{M}\sum_{m=1}^{M}\mathrm{Acc}(L_m)
$$

## 四、代码实现

```python
def effective_len(scores, lengths, tau=0.5):
    valid = [(l,s) for l,s in zip(lengths,scores) if s>=tau]
    return max([l for l,_ in valid], default=0)

print(effective_len([0.9,0.7,0.4,0.2],[4,32,128,200]))
```

## 五、与其他对比

相比 Needle（单检索），RULER 多任务；相比静态长 QA，它可缩放长度暴露衰减。

## 六、常见误区

误区一：宣称长度即有效长度。误区二：单任务高分代表全面。误区三：忽略聚合类任务难度。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Q：RULER 比 Needle 强在哪？答：多任务 + 长度缩放，测真实有效上下文。
- Q：有效上下文长度含义？答：得分未跌破阈值的上下文上限。

## 九、演进

RULER 确立"有效长度"概念，推动长上下文训练目标重标定。

## 十、小结

RULER 以多任务可缩放评测揭示宣称长度与实际能力的落差。
