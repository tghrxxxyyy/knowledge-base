# AMP的loss scaling机制

> 对应 pytorch/pytorch `GradScaler` 文档与 NVIDIA/TensorRT-LLM 的 FP16 动态缩放实现。

## 一、背景与挑战

FP16 的最小正规数约为 $6.1\times10^{-5}$，而深度网络的梯度在反向传播中常衰减到 $10^{-8}$ 甚至更小量级。这些梯度直接以 FP16 保存会下溢为 0，导致对应参数永久得不到更新——且这种失效是静默的，loss 曲线可能只是「学得慢」而非报错。

loss scaling 用一个自适应系数 $S$ 把梯度整体抬到 FP16 可表示区间，反向完成后在优化器步进前除回 $S$。难点在于 $S$ 的自动调节：太小仍会下溢，太大则上溢，需要一套基于 `inf`/`NaN` 检测的反馈控制。

## 二、核心原理

前向时把 loss 乘以 $S$，由链式法则，所有梯度同比例放大 $S$ 倍：

$$ \tilde L = S \cdot L \;\Rightarrow\; \tilde g = \nabla_\theta \tilde L = S \cdot g $$

因为 $S$ 是常数缩放，梯度方向与相对关系不变，只是幅值被抬升。反向结束后，在 `step` 前把 $\tilde g$ 除以 $S$ 还原，更新量与原 FP32 路径一致。

动态缩放器维护状态机：每步检查梯度中是否有 `inf`/`NaN`（由溢出产生）。若有则跳过本次更新、把 $S$ 减半；若连续若干步无溢出则把 $S$ 倍增。这使 $S$ 自动收敛到「刚好不溢出」的水平。

## 三、形式化与数学基础

缩放与还原：

$$ \tilde g = S\,g, \qquad \hat g = \frac{\tilde g}{S} = g $$

溢出判定：若某梯度元素 $\tilde g_i$ 满足 $|\tilde g_i| > 65504$，则 FP16 表示变为 $\pm\infty$，再过 `inf` 参与后续运算变 `NaN`。缩放器据此触发：

$$ S \leftarrow \begin{cases} S/2 & \text{本步出现 inf/NaN} \\ 2S & \text{连续 } \ge n \text{ 步无溢出} \end{cases} $$

初始值常取 $2^{16}$，倍增前的「无溢出步数」门限 $n$ 用于抑制抖动。下溢门槛为 $6.1\times10^{-5}$，故 $S$ 的合理目标区间应使典型梯度落于 $[6.1\times10^{-5},\, 65504]$ 内。

## 四、代码实现

```python
import torch

model = Net().cuda()
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)
scaler = torch.amp.GradScaler("cuda", init_scale=2.0 ** 16, growth_interval=2000)

for x, y in loader:
    opt.zero_grad(set_to_none=True)

    with torch.autocast(device_type="cuda", dtype=torch.float16):
        loss = model(x, y).loss

    scaler.scale(loss).backward()          # 反向：梯度被放大 S 倍

    scaler.unscale_(opt)                   # 还原梯度，供裁剪使用
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)

    scaler.step(opt)                       # 内部：无 inf/NaN 才真正更新
    scaler.update()                        # 依据溢出情况调整 S

# 查看当前缩放值用于诊断
print("current scale:", scaler.get_scale())
```

顺序铁律：`scale` → `backward` → `unscale_` → `clip` → `step` → `update`。裁剪必须在 `unscale_` 之后。

## 五、与其他技术对比

| 方案 | 是否需缩放 | 下溢风险 | 溢出风险 | 适用场景 |
| --- | --- | --- | --- | --- |
| FP32 | 否 | 极低 | 极低 | 基准、调试 |
| FP16 静态缩放 | 是，固定 $S$ | 取决于 $S$ | 固定 $S$ 易溢出 | 简单场景 |
| FP16 动态缩放 | 是，自适应 | 低 | 自适应规避 | 主流 FP16 训练 |
| BF16 | 通常否 | 极低（范围同 FP32） | 极低 | 大模型首选 |

BF16 的指数位与 FP32 相同，梯度几乎不会下溢到零，因此 GradScaler 在纯 BF16 路径下不仅多余，还可能干扰真实数值诊断。

## 六、常见误区

- 在 BF16 下启用 GradScaler：无收益且掩盖真实溢出，应关闭。
- 裁剪在 `unscale_` 之前：裁剪阈值作用在被放大的梯度上，实际阈值被缩小 $S$ 倍。
- 忘记 `scaler.update()`：$S$ 不再自适应，长时间训练后失配。
- 认为缩放能治溢出：缩放只解决下溢，$S$ 过大反而诱发上溢。
- 在 `backward` 前对 loss 做与 $S$ 无关的修改：会破坏连锁缩放的正确性。

## 七、与开源书·权威来源对应

pytorch/pytorch 的 `GradScaler` 文档完整描述了状态机、`unscale_` 语义与无梯度算子（如梯度裁剪）的处理；NVIDIA/TensorRT-LLM 在 FP16 路径采用动态缩放。默认参数与行为以官方最新文档为准。

## 八、面试题

- 问：loss scaling 防的是什么？答：防 FP16 梯度下溢归零，而非防上溢。
- 问：缩放为何不改变训练语义？答：$S$ 是常数缩放，梯度方向与相对比例不变，还原后与 FP32 一致。
- 问：动态缩放如何决定增减？答：出现 inf/NaN 则减半，连续无溢出则倍增。
- 问：为什么 BF16 一般不需要它？答：BF16 动态范围与 FP32 相同，没有下溢问题。

## 九、演进与趋势

BF16 普及后 GradScaler 在训练中逐步退场；FP8 引入更细粒度的分块缩放（per-tensor / per-block scale），缩放从「一个全局 $S$」走向「多尺度矩阵」；推理侧缩放常被离线校准替代。具体方案以官方最新文档为准。

## 十、小结

loss scaling 是 FP16 训练的护栏：用 $S$ 把梯度抬离下溢区，靠 `inf`/`NaN` 反馈自适应调整。它只治下溢不治上溢，且必须遵循 `unscale_` 在裁剪之前的顺序。改用 BF16 即可整段省略。
