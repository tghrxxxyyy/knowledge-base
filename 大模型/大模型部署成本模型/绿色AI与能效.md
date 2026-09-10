# 绿色 AI 与能效

> 对应 Green AI（Schwartz et al., 2020）与 LLM 碳足迹估算（Patterson et al., 2021）。能效正在成为硬约束。

## 一、背景与挑战

大模型训练与推理的能耗巨大，带来三重压力：电费成本、机房供电/散热的物理上限、以及碳排放合规。挑战在于：能效与性能常冲突（更准 = 更大 = 更耗电）；碳强度随电网结构与时段的差异很大；而且「训练一次」的碳排容易被拿来与推理的长期排放错误对比——推理是持续性的，累计排放往往超过训练。

## 二、核心原理

能耗分解：

$$E = (P_{\text{gpu}} + P_{\text{cpu}} + P_{\text{mem}} + P_{\text{cool}})\times T$$

其中 cooling 通常用 PUE（Power Usage Effectiveness）折算：

$$E_{\text{total}} = E_{\text{IT}} \times \text{PUE},\qquad \text{PUE}\approx1.1\text{–}1.5$$

碳排放：

$$\text{CO}_2\text{e} = E_{\text{total}} \times \text{CI}$$

CI（碳强度，gCO₂e/kWh）随电网差异巨大（水电/核电低，煤电高）。主要优化杠杆：

1. **算法层**：更小的模型、稀疏/条件计算（MoE）、早退。
2. **系统层**：利用率拉满（批处理）、混合精度、算子融合。
3. **调度层**：把训练排到低碳强度时段或低碳电网区域。
4. **硬件层**：新一代加速器的每瓦性能持续提升。

## 三、形式化与数学基础

训练排放（$N$ 卡、单卡功率 $P$、时长 $T$）：

$$\text{CO}_2\text{e}=N\cdot P\cdot T\cdot \text{PUE}\cdot \text{CI}$$

推理的累计排放（$Q$ 次请求、单次能耗 $e$）：

$$\text{CO}_2\text{e}_{\text{infer}} = Q\cdot e\cdot \text{PUE}\cdot \text{CI}$$

当 $Q$ 很大时后者反超训练。「能效比」指标：

$$\eta = \frac{\text{有效吞吐}}{\text{功率}} \quad [\text{tokens/J}]$$

## 四、代码实现

粗粒度碳排估算：

```python
def co2e(n_gpu=8, watts=400, hours=100, pue=1.3, ci=0.45):
    # n_gpu 卡、单卡 watts 瓦、跑 hours 小时；ci 单位 kgCO2e/kWh
    kwh = n_gpu * watts * hours / 1000 * pue
    return {"kwh": round(kwh), "kg_co2e": round(kwh * ci, 1)}
```

把 `ci` 换成不同电网的值，能直观看到「在哪里训练」的影响。

## 五、与其他技术对比

| 手段 | 减排幅度 | 代价 |
|------|---------|------|
| 提高利用率 | 大 | 无 |
| 混合精度 | 中 | 小 |
| 模型压缩/蒸馏 | 大 | 可能掉点 |
| 低碳时段调度 | 中 | 排期受限 |
| 换地域机房 | 不定 | 数据合规 |

## 六、常见误区

- 只报训练排放：长期服务的推理排放才是大头。
- 用平均电网碳强度：实际应按地域与时段。
- 忽略 PUE：机房冷却可占总能耗 10–40%。
- 认为「用绿色能源就零碳」：需看是否新增可再生装机（additionality）。

## 七、与开源书·权威来源对应

- Green AI（Schwartz et al., CACM 2020）。
- Carbon Emissions and Large Neural Network Training（Patterson et al., 2021）；以官方最新文档为准。

## 八、面试题

- 训练与推理的排放，哪个长期更大？为什么？
- PUE 是什么？如何影响总能耗？
- 在不掉点的前提下，有哪些能效优化手段？

## 九、演进与趋势

「每 token 焦耳」成为与「每 token 美元」并列的指标；碳感知调度进入云平台；MoE/稀疏化用条件计算降能耗；监管开始要求披露大模型碳足迹。

## 十、小结

绿色 AI 的核心是把能耗与碳排变成可度量、可优化的指标。先提高利用率与用对精度（几乎无损），再用压缩与调度换取更大减排。
