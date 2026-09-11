# 混合精度下的NaN定位

> 对应 Micikevicius 2018《Mixed Precision Training》(arXiv:1710.03740) 与 pytorch/pytorch AMP `GradScaler`。

## 一、背景与挑战

FP16 只有 5 位指数、10 位尾数，可表示范围约 $[6\times10^{-8},\ 65504]$。训练中的梯度值常小于 $10^{-8}$（下溢为 0）或大于 $65504$（上溢为 inf）。混合精度训练正是为解决这一矛盾而生：用 FP16 加速计算，同时用 FP32 主权重与 loss scaling 保住数值。

但当 FP16 训练真的出现 NaN 时，现象往往很隐蔽——参数突然变成 NaN，却很难判断是哪一步、哪个算子先坏掉的。定位的挑战在于：loss scaling 会把问题在时间上「推迟」暴露，且 inf 一旦产生就会沿反向传播污染整条链。

## 二、核心原理

混合精度依赖三项机制：

1. **FP32 主权重**：前向/反向用 FP16，参数更新在 FP32 副本上做，避免小更新被舍入吞掉。
2. **Loss scaling**：把 loss 乘以缩放因子 $S$，反向梯度等比放大，脱离下溢区后再除以 $S$ 更新。
3. **动态缩放（GradScaler）**：自动调整 $S$。某步梯度出现 inf/NaN 时跳过该步更新并减小 $S$；连续多步正常则尝试增大 $S$。

定位逻辑因此是：如果 `GradScaler` 频繁降低 scale，说明**前向或反向已经产生非有限值**，而不是缩放本身的问题。此时应回退到 FP32 复现，再逐模块二分定位首个异常张量。

## 三、形式化与数学基础

设 loss 为 $L$、缩放因子为 $S$，缩放后反向得 $\nabla_\theta(SL) = S\cdot\nabla_\theta L$。若 $S\cdot g$ 超出 FP16 上限 $65504$ 则为 inf，`scaler` 判定该步无效并按以下规则更新 $S$：

$$
S \leftarrow \begin{cases} S/2, & \text{检测到 inf 或 NaN（backoff）} \\ S\cdot 2, & \text{连续 } N_{growth} \text{ 步正常（growth）} \end{cases}
$$

更新前先反缩放再裁剪：$g_{\text{real}} = g_{\text{scaled}}/S,\ \hat{g} = \text{clip}(g_{\text{real}}, C)$。由此得到廉价而灵敏的在线判据——缩放因子单调下降即意味着梯度中出现了非有限值：

$$
S_k < S_{k-1} \Rightarrow \exists\, \text{inf/NaN in } \nabla
$$

## 四、代码实现

```python
# 用 GradScaler 检测非有限梯度，并在异常时保留现场
import torch

scaler = torch.amp.GradScaler("cuda")
prev_scale = scaler.get_scale()

with torch.autocast("cuda", dtype=torch.float16):
    out = model(x)
    loss = criterion(out, y)

scaler.scale(loss).backward()

# 反缩放前的梯度可用于诊断
grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
found_inf = not torch.isfinite(grad_norm)

scaler.step(opt)          # 内部若发现 inf 会跳过本次更新
scaler.update()           # 依据结果调整 scale

if scaler.get_scale() < prev_scale:
    print("step", step, "inf detected, grad_norm =", grad_norm.item())
    # 进一步：dump 各层梯度范数，定位首个 inf 层
```

若怀疑前向就有非有限值，可用 `torch.autograd.set_detect_anomaly(True)` 或逐模块前向钩子在 FP32 下复现：

```python
# FP32 复现 + 前向有限性断言
with torch.no_grad():
    h = x.float()
    for name, mod in model.named_children():
        h = mod(h)
        if not torch.isfinite(h).all():
            raise RuntimeError("non-finite after " + name)
```

## 五、与其他技术对比

| 精度方案 | 动态范围 | 是否需 loss scaling | NaN 风险 | 适用场景 |
| --- | --- | --- | --- | --- |
| FP32 | 约 $10^{\pm38}$ | 否 | 低（主因是逻辑错误） | 调试基线、小模型 |
| FP16 + 动态缩放 | 约 $[6e{-8}, 65504]$ | 是 | 中，下溢/上溢均可能 | 旧 GPU（无 BF16） |
| BF16 | 约 $10^{\pm38}$（尾数 8 位） | 通常否 | 低，但精度粗 | 现代 GPU/TPU 主流 |
| FP16 静态缩放 | 同上 | 需人工调 $S$ | 高，$S$ 不当即坏 | 已收敛的固定任务 |
| TF32（矩阵乘） | 约 $10^{\pm38}$ | 否 | 低 | NVIDIA Ampere 及以上 |

## 六、常见误区

- **scale 一直减半却不查前向**：缩放因子持续下降是「症状」不是「病因」，反复 backoff 会白白浪费大量步数。
- **认为 BF16 不会 NaN**：BF16 范围大，但除零、`log(0)`、坏样本仍会产生 NaN，只是概率更低。
- **在 FP16 下直接比较梯度阈值**：不同 scale 下阈值不可比，必须先反缩放。
- **忽略激活下溢**：小激活变 0 后在 LayerNorm 方差、除法中引发 $0/0$。
- **只盯 loss 曲线**：应先看 `scale` 与 `grad_norm`，它们比 loss 更早报警。

## 七、与开源书·权威来源对应

pytorch/pytorch 的 `torch.amp.GradScaler` 文档详细描述了 scale 的 grow/backoff 状态机与 `unscale_` 语义；Micikevicius 2018《Mixed Precision Training》(arXiv:1710.03740) 系统提出 loss scaling 与 FP32 主权重，是混合精度的奠基论文；NVIDIA 的 AMP 实践文档与 TensorRT-LLM 数值稳定说明给出工程侧建议。具体默认 scale 初值与增长窗口以官方最新文档为准。

## 八、面试题

- **问：动态 loss scaling 在什么情况下降低 scale？** 答：反向梯度出现 inf/NaN 时，该步更新被跳过且 $S$ 减半。
- **问：FP16 与 BF16 的取舍？** 答：FP16 精度更高但范围小、需缩放；BF16 范围大、几乎免缩放但尾数少、精度略低。
- **问：为什么 FP32 主权重不可省？** 答：参数更新量常小于 FP16 最小可表示增量，直接在 FP16 上累加会被舍入吞掉。
- **问：scale 骤降说明什么？** 答：前向或反向已产生非有限值，需回退 FP32 逐模块定位，而不是继续调 scale。
- **问：如何判断是 overflow 还是 underflow？** 答：grad_norm 为 inf 属 overflow；梯度大量精确为 0 而 scale 增长失败则提示 underflow。

## 九、演进与趋势

硬件层面，BF16/TF32 的普及正让「loss scaling」逐步淡出——BF16 的动态范围与 FP32 相同（仅精度降低），绝大多数任务无需缩放即可稳定训练。软件层面，数值调试正走向自动化：`torch.autograd.set_detect_anomaly`、逐模块有限性钩子与梯度直方图被集成进训练框架，可在首个异常算子处精确断点。未来趋势是「默认 BF16 + 自动异常检测 + 可复现 fp32 回放」三位一体，把 NaN 定位从人工排查变成框架能力。

## 十、小结

混合精度下的 NaN 多源于缩放过激与数值下溢/上溢的交互，而非优化器本身。定位的关键是理解 `GradScaler` 的 scale 变化即「数值健康探针」，一旦异常就回退 FP32 逐层复现。长期看，迁移到 BF16 并从框架侧内建非有限值检测，是把此类问题从「事后救火」变为「事中拦截」的根本路径。
