# AWQ的局限与适用边界

> 对应 Lin 2023 AWQ 论文讨论与 community 实践反馈。

## 一、背景与挑战

AWQ 并非万能。它对激活分布敏感，当校准集与推理分布不一致，或模型结构特殊时收益会下降。

## 二、核心原理

AWQ 假设"大激活对应重要权重"，这一先验在多数 LLM 成立，但在 MoE 路由、强 outlier 层等场景可能失效。此外它不重建权重，极低位下天花板低于 GPTQ 类补偿法。

## 三、形式化与数学基础

AWQ 的缩放 $ s_j $ 由 $ \\mathbb E[|x_j|^\\alpha] $ 决定；若校准分布 $ p_{calib}(x)\\ne p_{inf}(x) $，则估计的 $ s $ 偏离最优：

$ s^*_{\\text{inf}}\\ne s^*_{\\text{calib}} $

导致保护错位。

## 四、代码实现

```python
def awq_mismatch_check(W, X_calib, X_inf):
    s_c = awq_scale(W, X_calib)[2]
    s_i = awq_scale(W, X_inf)[2]
    return (s_c - s_i).abs().mean().item()   # 越大说明校准漂移越严重
```

## 五、与其他技术对比

- GPTQ 在分布漂移下也需重校准，但补偿更鲁棒。
- QAT 直接从训练分布学习，边界更宽但成本高。

## 六、常见误区

- 一次校准走天下，忽略部署域偏移。
- 认为 AWQ 一定优于 GPTQ，忽视任务差异。

## 七、与开源书/权威来源对应

- Lin et al. 2023, AWQ.
- huggingface/transformers: https://github.com/huggingface/transformers
- facebookresearch/llama: https://github.com/facebookresearch/llama

## 八、面试题

- AWQ 在哪些场景会失效？
- 校准集漂移如何检测与缓解？
- 何时不应选 AWQ？

## 九、演进与趋势

自适应/在线缩放与域自适应校准正在缓解这些边界问题。

## 十、小结

AWQ 简单有效，但依赖校准质量与激活先验；理解其边界才能稳妥落地。
