# 学习率预热warmup机制

> 对应 Goyal et al., *Accurate, Large Minibatch SGD: Training ImageNet in 1 Hour* (2017) 提出的线性预热；d2l-ai/d2l-zh 学习率章节；karpathy/nanoGPT 实现。

## 一、背景与挑战

在大模型（Transformer）训练初期，参数尤其是 LayerNorm/RMSNorm 与注意力矩阵尚未稳定，优化器（如 Adam）的二阶矩估计 $v_t$ 也处于冷启动。此时若直接施加大学习率，单步更新幅度过猛，极易引发梯度爆炸、损失 NaN，使训练崩溃。大规模预训练中，这种崩溃往往意味着数天算力的浪费，因此 warmup 不是锦上添花，而是稳定训练的必需。

## 二、核心原理

预热（Warmup）在前 $T_{\text{warm}}$ 步内，把 LR 从近 0 线性（或常数）升到目标峰值 $\eta_{\max}$，给优化器与参数一个「热身」窗口：二阶矩估计逐渐累积到合理尺度，参数分布进入稳定区。此后接入余弦退火等衰减曲线。预热长度通常与总步数成比例（如 0.5%–3%），大模型需要更长。直觉上，warmup 让优化器「先看清地形」再迈大步。

## 三、形式化与数学基础

线性预热阶段（$t\le T_{\text{warm}}$）：

$$\eta_t = \eta_{\max}\cdot \frac{t}{T_{\text{warm}}}$$

常数预热则为 $\eta_t=\eta_{0}$（小值）持续 $T_{\text{warm}}$ 步。预热后接余弦：令 $p=(t-T_{\text{warm}})/(T_{\text{total}}-T_{\text{warm}})$，则

$$\eta_t = \eta_{\min} + \tfrac{1}{2}(\eta_{\max}-\eta_{\min})(1+\cos(\pi p))$$

整体曲线为先升后降，避免初期大幅破坏参数。从 Adam 视角，warmup 等价于让 $v_t$ 的 EMA 先积累足够样本，避免被早期大梯度主导。

## 四、代码实现

```python
import math

def lr_with_warmup(t, T_warm, T_total, lr_max, lr_min=0.0):
    if t < T_warm:
        return lr_max * t / T_warm          # 线性升温
    p = (t - T_warm) / (T_total - T_warm)
    return lr_min + 0.5 * (lr_max - lr_min) * (1 + math.cos(math.pi * p))

# 典型配置：warmup 占总量 2%
T_total, T_warm = 100000, 2000
for t in range(0, T_total, 10000):
    print(t, round(lr_with_warmup(t, T_warm, T_total, 3e-4), 6))
```

## 五、与其他技术对比

| 策略 | 初期稳定 | 收敛速度 | 大模型适配 | 风险 |
| --- | --- | --- | --- | --- |
| 无 warmup | 差（易 NaN） | 快但危险 | 不适用 | 崩溃 |
| 恒定小 LR | 好 | 慢 | 浪费前期容量 | 欠拟合 |
| 线性 warmup | 好 | 平衡 | 主流 | 步数需调 |
| 余弦 warmup | 好 | 平衡 | 现代 | 略复杂 |

## 六、常见误区

误区一：warmup 步数过短（仅百步）对超大模型仍不足。误区二：过长浪费前期学习容量、拖慢收敛。误区三：把 warmup 当作「越快升越好」——线性升温更稳，突变升温仍可能失稳。误区四：认为小模型不需要 warmup——虽不如大模型关键，但有仍更稳。

## 七、与开源书·权威来源对应

- Goyal et al., *Accurate, Large Minibatch SGD* (2017)（线性预热提出，支撑大 batch 训练）。
- d2l-ai/d2l-zh 讨论 warmup 必要性。
- huggingface/transformers 的 `get_linear_schedule_with_warmup`。

## 八、面试题

1. warmup 主要防止什么问题？为什么初期大 LR 危险？
2. 预热长度如何选取？与模型规模有何关系？
3. warmup 后通常接什么衰减？为何这样组合？
4. 从 Adam 二阶矩角度解释 warmup 的作用。

## 九、演进与趋势

除线性 warmup 外，出现余弦式 warmup、带重启的多段 warmup；一些工作探索「无 warmup」的优化器（如 Lion、Sophia）以降低调参负担；也出现根据 loss 曲线自适应延长 warmup 的策略。

### 实践速查

- 长度：warmup 步数常取总步数 0.5%–3%，越大模型越长。
- 形状：线性升温最常用，余弦 warmup 亦可，避免突变升温。
- 峰值：warmup 末达到设定 $\eta_{\max}$，再接余弦衰减。
- 诊断：首步 loss 出现 NaN 多半是 warmup 过短或峰值过高。
- 微调：指令微调阶段 warmup 可更短，因已具备稳定表征。
- 优化器：Adam 类尤其需要 warmup 让二阶矩估计冷启动平稳。

### 常见问题

- 问：warmup 太短会怎样？答：大模型首步易梯度爆炸、loss NaN。
- 问：warmup 太长呢？答：浪费前期学习容量，收敛变慢。
- 问：小模型需要 warmup 吗？答：非必须，但加上通常更稳。

### 关键记忆点

- warmup 给优化器与参数热身，避免初期大 LR 引发的梯度爆炸。
- 步数随模型规模增长，常取总步数 0.5%–3%。
- Adam 类优化器尤其依赖 warmup 让二阶矩估计平稳冷启动。

## 十、小结

warmup 是大模型训练不可或缺的稳定器，与余弦退火互补，构成「先升温后退火」的标准 LR 形态，缺之易致训练崩溃。
