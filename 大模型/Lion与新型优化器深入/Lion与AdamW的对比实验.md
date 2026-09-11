# Lion与AdamW的对比实验

> 对应 Chen et al. 2023《Lion》(arXiv:2302.06675) 与 Loshchilov & Hutter 2019《AdamW》(arXiv:1711.05101)。

## 一、背景与挑战

是否值得从成熟、鲁棒的 AdamW 切换到 Lion？这个问题不能靠直觉，而要在**效果、稳定性、资源**三个维度上用对比实验回答。尤其在大模型场景，一次完整预训练成本高昂，选错优化器代价巨大。

本章梳理公开的对比结论与实操经验，帮助工程师建立迁移预期。

## 二、核心原理

两者都采用**解耦权重衰减**，差异集中在更新幅度机制：

- **AdamW**：更新幅度 $\eta\cdot\hat m/\sqrt{\hat v}$，逐元素自适应，幅度随参数异质。
- **Lion**：更新幅度 $\eta\cdot\mathrm{sign}(m)$，方向取符号、幅度恒定。

由于 Lion 幅度被统一为 1（再乘 $\eta$），它对学习率 $\eta$ 与 $\beta_1$ 极其敏感：典型 Lion 的 lr 在 $1e-4\sim3e-4$ 量级，约为 AdamW 的 $1/3\sim1/10$；$\beta_1$ 常取更高（如 0.95）。直接用 AdamW 的 lr 喂 Lion 会发散。

## 三、形式化与数学基础（含 LaTeX）

AdamW 步长：$\eta\cdot\hat m/\sqrt{\hat v}$；Lion 步长：$\eta\cdot\mathrm{sign}(m)$。

二者梯度尺度不同导致学习率不可直接迁移。经验缩放关系：

$$
\eta_{Lion}\approx \frac{\eta_{AdamW}}{k},\quad k\in[3,10]
$$

且 $\beta_{1,Lion}>\beta_{1,AdamW}$。给定相同训练步数 $T$，收敛质量 $Q$ 受 $(\eta,\beta_1)$ 组合影响；Lion 的 $Q$ 曲面更尖锐，需更精细搜参。

## 四、代码实现（围栏配平）

```python
# 经验超参对照：迁移时首要调 lr 与 beta1
adamw_cfg = dict(lr=3e-4, betas=(0.9, 0.95), weight_decay=0.1)
lion_cfg  = dict(lr=1e-4, betas=(0.95, 0.98), weight_decay=0.1)  # lr 更小、beta1 更高

def switch_to_lion(model):
    # 切换优化器：降低 lr、调高 beta1，并保留解耦权重衰减
    return Lion(model.parameters(), **lion_cfg)
```

## 五、与其他技术对比

- **效果**：Chen et al. 2023 报告 Lion 在 ViT、语言建模、扩散模型上略优或持平，但收益受任务与调参影响，并非全面碾压。
- **稳定性**：AdamW 更鲁棒、易复现，Lion 对超参更挑剔，需更多搜索。
- **资源**：Lion 省一半优化器状态，适合显存受限的大规模训练。

## 六、常见误区

- 「用 AdamW 的 lr 直接喂 Lion」——会发散，必须降 3~10 倍。
- 「忽略 $\beta$ 差异」——$\beta_1$ 不同导致动量积累速度不同，收敛慢或震荡。
- 「Lion 一定更快收敛」——省的是显存不是步数，收敛速度取决于调参质量。

## 七、与开源书·权威来源对应

- Chen et al. 2023 给出 Lion 在图像、语言、扩散多任务上与 AdamW 的详细对比与超参建议。
- Loshchilov & Hutter 2019 提供 AdamW 基线及解耦衰减的理论依据。
- HuggingFace Transformers / mlabonne/llm-course 收录了两类优化器的工程配置参考。

## 八、面试题

- 问：迁移到 Lion 首要改什么？答：把 lr 降约 3~10 倍并调高 $\beta_1$（如 0.95），重做 warmup/衰减，保留解耦衰减。
- 问：Lion 相比 AdamW 的核心取舍？答：以更敏感的超参换一半优化器状态与特定任务上的略优。
- 问：为何 AdamW 仍是默认？答：长期稳定性、社区验证与易复现性更强，风险更低。

## 九、演进与趋势

自动化选择优化器（按规模/数据/任务自动决定 AdamW 或 Lion）是实际部署方向；符号优化与低精度训练栈的融合也会降低迁移门槛。

### 关键要点速查

- Lion 与 AdamW 都用解耦权重衰减，差异在更新幅度机制。
- AdamW 自适应幅度（$\hat m/\sqrt{\hat v}$），Lion 符号恒定幅度，对 lr 更敏感。
- 迁移 Lion：lr 降 3~10 倍、$\beta_1$ 调高（如 0.95）、重设 warmup。
- 论文报告 Lion 在 ViT/语言建模/扩散上略优或持平，但受调参影响。
- AdamW 更鲁棒易复现，Lion 对超参更挑剔，需更多搜索。
- Lion 省一半优化器状态，适合显存受限的大规模训练。
- 直接用 AdamW 的 lr 喂 Lion 会发散，是最常见错误。
- 自动化选优化器是部署方向，符号优化与低精度栈融合降低门槛。

- 对比应在相同数据、种子、step 数下进行，控制变量。
- 报告不止最终指标，还应给训练曲线与方差。
- 对小数据，AdamW 的鲁棒性常胜出，不必强切 Lion。
- 学习率搜索空间对 Lion 应更细，因其更敏感。
- 记录峰值显存与每步耗时，全面评估 ROI。
- 下游微调阶段可回到 AdamW，预训练用 Lion 省资源。
- 把对比结论按模型规模分层，避免以偏概全。
- 注意 Lion 对 batch 大小与 warmup 的耦合反应。
- 公开复现时优先用官方推荐超参作基线。
- 把实验脚本入库，保证结论可复核。

## 十、小结

Lion 在显存与特定任务上占优，但 AdamW 仍是稳妥默认；迁移 Lion 的本质是用超参敏感度换状态节省，需以对比实验验证收益。
