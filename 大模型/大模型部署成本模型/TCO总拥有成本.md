# TCO 总拥有成本

> 对应 FrugalGPT（Chen et al. 2023）与云厂商 GPU 实例定价实践。TCO 决定大模型能力能否被负担。

## 一、背景与挑战

评估大模型方案时只看「每千 token 价格」会严重失真。真实成本包含：硬件（买或租）、能耗与机房、运维人力、推理/训练的软件栈、数据管线、以及失败重试与闲置浪费。TCO（Total Cost of Ownership）把这些汇总到统一口径，用于比较自建 vs 云上、闭源 API vs 自部署。挑战在于：GPU 价格波动大；利用率假设对结论极其敏感；隐性成本（人力、排队、故障）常被忽略。

## 二、核心原理

TCO 的基本分解：

$$\text{TCO} = C_{\text{capex}} + C_{\text{opex}} + C_{\text{labor}} + C_{\text{data}} + C_{\text{idle}}$$

- **Capex**：GPU/服务器购置，按折旧年限摊到每月。
- **Opex**：电费、机房、网络、云实例费、license。
- **Labor**：MLOps/平台工程人力，常被低估。
- **Idle**：预留但闲置的容量（为峰值准备）。

关键指标是**单位业务成本**（如每千次请求、每份报告），而非单位 token 成本：

$$\text{unit cost}=\frac{\text{TCO}_{\text{month}}}{\text{业务量}_{\text{month}}}$$

决策规则：算力需求稳定且量大时自建更省；需求波动大或有峰值时云/API 更划算。

## 三、形式化与数学基础

自建摊销（$P$ 购置价，$Y$ 折旧年数，$U$ 利用率）：

$$C_{\text{capex/mo}}=\frac{P}{12Y},\qquad C_{\text{eff}}=\frac{C_{\text{capex/mo}}}{U}$$

云上按需：

$$C_{\text{cloud}} = p_{\text{hour}} \times H \times N_{\text{gpu}}$$

盈亏平衡点满足 $C_{\text{eff}} = C_{\text{cloud}}$，可解出临界利用率 $U^*$：

$$U^* = \frac{P}{12Y\, p_{\text{hour}}\, H\, N_{\text{gpu}}}$$

当实际利用率持续高于 $U^*$ 时自建更优。

## 四、代码实现

简易 TCO 估算器：

```python
def tco_monthly(gpu_price=25000, years=3, util=0.6,
                power_kw=0.7, kwh_price=0.8, labor=30000, n_gpu=8):
    capex = gpu_price * n_gpu / (12 * years)
    power = power_kw * n_gpu * 24 * 30 * kwh_price
    return {"capex": round(capex), "power": round(power),
            "labor": labor, "total": round(capex + power + labor),
            "eff_at_util": round((capex + power) / util + labor)}
```

调整 `util`（利用率）观察结论翻转，是这类分析最有用的一步。

## 五、与其他技术对比

| 方案 | 成本结构 | 弹性 | 适合 |
|------|---------|------|------|
| 闭源 API | 纯按量 | 极高 | 波动/起步 |
| 云 GPU 自建 | 按小时 | 高 | 中等稳定 |
| 自建机房 | 重资产 | 低 | 长期稳定大用量 |
| 端侧 | 边际近零 | 中 | 高频简单任务 |

## 六、常见误区

- 只比 token 单价，忽略人力与闲置。
- 用 100% 利用率做假设：真实常年在 30–60%。
- 忽略排队与重试带来的隐形开销。
- 认为自建一定便宜：低利用率下自建单位成本远高于 API。

## 七、与开源书·权威来源对应

- FrugalGPT: How to Use Large Language Models While Reducing Cost（Chen et al., 2023）。
- 云厂商公开定价文档；以官方最新文档为准。

## 八、面试题

- TCO 包含哪些常被忽略的项？
- 什么条件下自建比用 API 便宜？
- 利用率假设为何对结论影响最大？

## 九、演进与趋势

模型小型化 + 路由（简单问题走小模型）显著降本；Spot 实例与推理专用芯片（推理卡）改变成本曲线；按业务结果计费（outcome-based）逐步出现。

## 十、小结

TCO 的精髓是把 capex、能耗、人力、闲置都算进单位业务成本，并做利用率敏感性分析。先算清「每千次请求成本」，再谈技术选型。
