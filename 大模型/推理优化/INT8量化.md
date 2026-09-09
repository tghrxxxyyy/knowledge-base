# INT8 量化

> 对应 llm-course 与 Dettmers et al.(2022, LLM.int8())、Xiao et al.(2022, SmoothQuant)。

## 一、背景与挑战

INT8 把 FP16 权重/激活压到 8-bit，理论上显存与带宽减半、整数算力也更高，是「几乎无损」的甜点精度。但大模型有个特殊难题：**离群值（outlier）**——极少数激活维度数值远大于其余，会把均匀量化的范围整体拉大，导致多数正常值被挤到极少量化级别，精度骤降。这一「离群值灾难」使朴素 INT8 在 6B 以上模型上反而变慢或变差。破解之道是分离/迁移离群值，而非简单降低比特。

## 二、核心原理

- **LLM.int8()（向量化量化）**：提出混合精度分解——对含离群值的「特征维度」保持 FP16，对其余大量「非离群特征」做 INT8 矩阵乘，再合并。几乎无损，但需频繁 dtype 切换与额外 kernel，实现复杂且未必更快。
- **SmoothQuant**：核心洞察是「离群值在激活、权重都可见」。它用一个平滑系数把激活的离群幅度**迁移到权重**上，使两者都落入 INT8 友好范围，从而可用统一 INT8 算子，硬件真正加速：

$$
\tilde X = X\cdot \text{diag}(s)^{-1},\quad \tilde W = W\cdot \text{diag}(s),\quad XW=\tilde X\tilde W
$$

- 此外还有 **RTN（四舍五入）** 作为基线，以及 **动态/静态量化** 之分（scale 是否固定）。W8A8 表示权重与激活均 INT8。

### 工程落地要点

- **优先 W8A8**：权重与激活都 INT8 才能真正加速，仅权重量化对 LLM 常不提速。
- **SmoothQuant 调 α**：α 偏小保激活、偏大保权重，按层敏感度搜索最优，常用 0.5 附近起点。
- **静态 vs 动态**：静态需代表性标定且对分布漂移敏感；动态更稳但略慢，在线服务多取动态或校准后静态。
- **内核支持**：确认后端有融合的 INT8 GEMM/Attention 内核，否则退化到仿真反而慢。
- **离群通道保护**：对极端离群维度可单独保留高比特，避免整体精度塌方。
- **验收**：量化后跑困惑度与下游任务，掉点超阈就回退到 FP16 或换算法。

## 三、形式化与数学基础

均匀 INT8 量化（对称）：

$$
q = \text{clip}\left(\left\lfloor \frac{x}{\Delta}\right\rceil,\ -128,\ 127\right),\qquad \Delta = \frac{\max|x|}{127}
$$

离群值使 $\Delta$ 过大，正常区间量化步长变粗。SmoothQuant 选 $s_j$ 平衡激活与权重：

$$
s_j = \left(\frac{\max|X_j|}{\max|W_j|}\right)^{\alpha},\qquad \alpha\in[0,1]
$$

$\alpha$ 越大越把离群压向权重。最终两者量化误差的均方近似最小：

$$
\|XW - \tilde X\tilde W\| \approx \min_s \big(\|\delta_X\| + \|\delta_W\|\big)
$$

## 四、代码实现

用 PyTorch 动态 INT8（线性层示意）：

```python
import torch
linear = torch.nn.Linear(4096, 4096)
x = torch.randn(1, 4096, dtype=torch.float16)

# 动态量化权重到 int8（推理）
q_linear = torch.quantization.quantize_dynamic(
    linear, {torch.nn.Linear}, dtype=torch.qint8)
y = q_linear(x)                       # 内部 int8 计算

# SmoothQuant 需在导出前做激活统计与权重平滑，这里仅为概念示意
```

## 五、与其他技术对比

| 方法 | 思路 | 是否真加速 | 实现难度 |
|------|------|-----------|----------|
| RTN INT8 | 直接舍入 | 有时劣化 | 低 |
| LLM.int8() | 离群特征保 FP16 | 未必（kernel 开销） | 高 |
| SmoothQuant | 迁移离群到权重 | 是 | 中 |

## 六、常见误区

- **INT8 一定比 FP16 快**：离群问题未解决时，频繁 dtype 切换反而更慢。
- **只量化权重即可**：激活离群不处理，端到端仍崩。
- **静态 scale 万能**：分布漂移时静态标定会失准，动态更稳但略慢。
- **8-bit 永远无损**：极端离群或极小模型上仍可能掉点。
- **SmoothQuant 只看激活**：它同时改权重，需保证 $XW=\tilde X\tilde W$ 等价性。

## 七、与开源书·权威来源对应

- Dettmers et al., *LLM.int8(): 8-bit Matrix Multiplication for Transformers*, 2022。
- Xiao et al., *SmoothQuant: Accurate and Efficient Post-Training Quantization*, 2022。
- 与「量化基础」「GPTQ与AWQ」互补。

## 八、面试题

1. 为何大模型 INT8 量化会遇到离群值（outlier）问题？它从哪来？
2. SmoothQuant 的核心思想是什么？为何能「真正加速」而 LLM.int8() 未必？
3. 静态量化与动态量化的取舍？
4. 为何「只量化权重」的 INT8 在 LLM 上常不加速？

## 九、演进与趋势

INT8 仍是生产部署主力精度；其后 W8A8（权重+激活都 INT8）借助 SmoothQuant 类方法趋于成熟。更前沿是 INT4 推理与「旋转量化消除离群」让更低比特可行。趋势是「离群感知 + 硬件融合算子」，让 8-bit 在保持无损的同时获得确定加速，并与张量核心的 INT8 指令深度协同。

## 十、小结

INT8 是兼顾无损与提速的甜点精度，但大模型的离群值会破坏朴素量化。LLM.int8() 用混合精度保住离群特征却未必更快；SmoothQuant 通过把离群迁移到权重，使统一 INT8 算子真正加速。落地应优先 W8A8 + 离群处理，并按硬件内核选择静态/动态标定，避免「量化了却不快」的陷阱。
