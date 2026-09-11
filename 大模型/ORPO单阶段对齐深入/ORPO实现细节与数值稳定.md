# ORPO实现细节与数值稳定

> 对应 Hong 2024 ORPO 与 pytorch/pytorch。

## 一、背景与挑战

ORPO 的 odds 计算涉及 $\pi$ 与 $1-\pi$ 及对数变换，若先取概率再取 log 易出现下溢或 log(0)；同时 NLL 与 OR 项量级差异大，梯度需平衡。实现上的数值稳定直接决定训练能否收敛。混合精度（fp16/bf16）下问题更突出：softmax 后接近 0 的概率在 exp 下溢，导致 log 变 -inf，再进入 logsigmoid 即产生 NaN，进而污染整个参数更新。

## 二、核心原理

稳定性要点：
- 用 log_softmax 直接得 log 概率，避免先 softmax 再 log 的 exp 下溢。
- 用 log1p 与 log-sum-exp 技巧计算 log-odds，避免 $1-\pi$ 的精度损失。
- 所选与拒答共享一次前向，复用 logits 降低开销。
- 对 NLL 与 OR 项分别监控，必要时按梯度范数平衡。
- 混合精度下建议对 logp 计算保持足够精度（或仅在 OR 项用 fp32 累加），避免下溢触发 NaN。

## 三、形式化与数学基础

以 logit $z$ 表示 $\pi=\sigma(z)$，log-odds 为：

$$
\log\mathrm{odds}(y)=\log\pi_\theta(y)-\log\big(1-\pi_\theta(y)\big)=z-\log(1+e^{-z})
$$

在 log 空间用 `log1p(-exp(lp))` 计算 $\log(1-\pi)$ 可避免显式求 $1-\pi$：

$$
\log(1-\pi)=\log(1-e^{\mathrm{lp}})=\mathrm{log1p}(-e^{\mathrm{lp}})
$$

其中 $\mathrm{lp}=\log\pi$ 来自 log_softmax。注意当 $\mathrm{lp}\to 0^-$（$\pi\to 1$）时 $\mathrm{log1p}(-e^{\mathrm{lp}})$ 趋于 $-\infty$，需确保此类目标 token 不进入 OR 项或做裁剪。

## 四、代码实现

```python
import torch.nn.functional as F

def log_odds_from_logits(logits, target_id):
    # 稳定计算 log-odds, 避免下溢
    logp = F.log_softmax(logits, dim=-1)
    lp_target = logp.gather(-1, target_id)
    log1m = torch.log1p(-torch.exp(lp_target))   # log(1-pi)
    return lp_target - log1m

def orpo_term_stable(logits_w, wid_w, logits_l, wid_l, lam=0.1):
    # 共享前向, 分别取所选/拒答 log-odds
    lo_w = log_odds_from_logits(logits_w, wid_w)
    lo_l = log_odds_from_logits(logits_l, wid_l)
    return -lam * F.logsigmoid(lo_w - lo_l).mean()

def grad_norm(model):
    # 监控梯度, 防 NLL/OR 失衡
    return sum(p.grad.norm().item() for p in model.parameters() if p.grad)
```

## 五、与其他技术对比

| 方法 | 数值要点 |
| --- | --- |
| DPO | 需稳 logp 差与 ref 差 |
| ORPO | 额外要求 NLL 与 OR 项梯度平衡 |
| KTO | 单边信号 + 期望锚定 |

## 六、常见误区

- 单独 softmax 后再 log1p：中间 exp 下溢，丢精度。
- $\lambda$ 在不同 batch 未归一：长短样本混训时 OR 项量级漂移。
- 忽视 NLL 与 OR 量级差：一项主导致训练失衡。
- 在 fp16 直接算 logp：精度不足易出 NaN，建议 OR 项用 fp32。
- 所选/拒答重复前向：浪费算力且可能引入不一致。

## 七、与开源书·权威来源对应

- Hong 2024 给出实现要点。
- pytorch/pytorch 提供 log_softmax、logsigmoid 等稳定接口。
- 混合精度训练可参考 pytorch AMP 文档的 best-practice。

## 八、面试题

- 为何用 log_softmax 而非 softmax+log？log1p 解决什么？
- 如何平衡 NLL 与 OR 项梯度？混合精度下要注意什么？
- 当 $\pi\to 1$ 时 log-odds 为何发散，如何规避？

## 九、演进与趋势

混合精度（bf16）下专门 kernel 加速 log-odds；融合前向降低所选/拒答重复计算。框架层（trl）已把稳定实现封装，用户只需关注 $\lambda$ 与数据，数值细节由底层保证。

（补充）在真实训练脚本中，还有几个易踩的坑：其一是混合精度下 `log_softmax` 的输出范围受限于 fp16 精度，极端 logp 可能塌缩，建议 OR 项相关计算用 fp32 或 bf16；其二是多卡 FSDP 下，所选与拒答必须来自同一前向分片，否则 logp 不可比。实践要点：

- 训练开头几百步打印 NLL 与 OR 项的量级，确认二者在同一数量级附近再放开训练。
- 若出现 NaN，优先检查 `log1p(-exp(lp))` 中 lp 是否意外为正（违反 logp≤0）。
- 用梯度范数监控整体失衡，NLL 梯度被 OR 项淹没时范数会异常偏小。
- 将数值检查封装为训练循环的断言，Fail-fast 比静默退化更易定位。

随着 bf16 训练成为主流，专用 kernel 已能在 log-space 一次性给出 log-odds，进一步降低手写数值技巧的负担，但理解其底层原理仍有助于排查异常。

## 十、小结

数值稳定靠 log-space 计算与梯度平衡：用 log_softmax+log1p 避免下溢，并在混合精度下保精度，是 ORPO 落地的前提。稳定实现不到位，训练极易 NaN，且难定位。
