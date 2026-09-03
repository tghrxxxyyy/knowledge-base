# SAE 应用与局限

> 对应 Rimsky et al., *Steering Language Models with SAEs*, 2024；Anthropic, *Scaling Monosemanticity*, 2024.

## 一、背景与挑战

SAE 特征可用于 steering、监控、误用检测，但仍非完美“真”特征，存在局限。

## 二、核心原理

用 SAE 特征方向做激活 steering（加/减某特征向量）或实时监控某特征激活；局限包括特征间耦合、规模成本、非完备性。

## 三、数学形式

steering 激活 $h'=h+\alpha\,d_f$（$d_f$ 为某特征解码向量）；监控阈值 $\mathbb I(f(x)>\tau)$。

## 四、代码实现

```python
feat = sae.encode(cache[layer])
if feat[:, suicide_idx].max() > thr:
    flag("dangerous feature")
out = sae.decode(feat + alpha*steer_vec)
```

## 五、与其他对比

- 与 激活监控深入（监控对象即 SAE 特征）衔接。
- 与 特征归因深入（定位 vs 分解）互补。

## 六、常见误区

- 把 SAE 特征当因果单元（仍可能耦合）。
- 大规模 SAE 推理开销被低估。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- SAE steering 的局限？答：特征非独立因果单元，steering 可能牵动相关特征且大规模开销大。

## 九、演进

离线分析 → steering → 实时安全监控。

## 十、小结

SAE 已走向应用，但须清醒认识其近似性与成本，作为辅助而非银弹。
