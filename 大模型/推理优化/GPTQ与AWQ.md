# GPTQ 与 AWQ 权重量化

> 对应 Frantar et al.(GPTQ, 2022) 与 Lin et al.(AWQ, 2023)。4-bit 权重量化的两大主流。

## 一、背景与挑战

把大模型权重压到 4-bit 是降本刚需，但「直接按层四舍五入」会累积巨大误差，尤其权重的列间高度相关——量化一列会扭曲它对其他列的依赖。GPTQ 与 AWQ 是两套互补的 4-bit 权重量化（W4）方案：GPTQ 从**优化视角**做二阶误差补偿，AWQ 从**重要性视角**保护关键通道。两者都不需重训、一次标定即可部署，且都有成熟推理后端（如 llama.cpp、vLLM、TensorRT-LLM、MLC-LLM）。难点在于低比特下如何最小化精度损失并兼顾硬件吞吐，以及激活量化是否配套处理。

## 二、核心原理

- **GPTQ（Generative Post-Training Quantization）**：逐层、逐列（按输出通道）量化权重，利用**未量化权重的 Hessian 信息**做误差补偿——量化某一列后，把产生的量化误差按二阶近似补偿到后续未量化列，近似达到「该层量化后输出最接近全精度」的最优。一次标定即可把 175B 量化到 4-bit。
- **AWQ（Activation-aware Weight Quantization）**：观察到「仅约 1% 的权重通道对激活贡献极大」，若量化这些通道损失惨重。AWQ 按**激活幅度**识别重要通道，对其做缩放保护（不量化或减量化），其余通道正常量化。方法简单、硬件友好、无需反量化重计算。

### 工程落地要点

- **选谁**：生态成熟、要极致精度且不在意训练复杂度选 GPTQ；要部署简单、硬件友好、快选 AWQ。
- **标定数据**：用 128–256 条代表性样本做 calibration，分布越贴近推理分布越好。
- **组大小 group_size**：GPTQ 常设 128，越小越准但体积略增，按任务调。
- **激活量化**：做 W4A16 仅省显存；要提速需配套 W4A8 激活量化内核。
- **后端校验**：确认 vLLM/llama.cpp/TensorRT-LLM 支持目标格式再上线，否则徒省不快。
- **按层混合**：可对离群严重的层保留更高精度，其余 4-bit，进一步压掉点。

## 三、形式化与数学基础

GPTQ 对单层权重 $W$ 的列 $j$ 量化，用 Hessian $H=2X^\top X+\lambda I$（$X$ 为标定激活），补偿后续列 $i$：

$$
\Delta w_i \leftarrow \Delta w_i - \frac{w^{(q)}_j - w_j}{[H^{-1}]_{jj}}\, H^{-1}_{ji}
$$

逐列迭代使量化层输出 $\hat W X$ 逼近 $WX$。AWQ 则求解通道缩放 $s$：

$$
\hat W = \text{diag}(s)\cdot W,\quad \text{量化}\ \hat W,\qquad
s = \arg\min_s \big\| WX - \text{quant}(\hat W)X \big\|
$$

重要通道对应大激活幅值，得更大 $s$ 以保护，使其脱离低精度量化区间。

## 四、代码实现

AWQ 推理加载（autoawq）：

```python
from awq import AutoAWQForCausalLM
model = AutoAWQForCausalLM.from_quantized("model-awq-4bit",
                                          fuse_layers=True)
# 也可用 transformers + 量化配置
from transformers import BitsAndBytesConfig
# GPTQ 常用 optimum/auto-gptq:
# from auto_gptq import AutoGPTQForCausalLM
# model = AutoGPTQForCausalLM.from_quantized("model-gptq-4bit")
```

## 五、与其他技术对比

| 方法 | 核心思想 | 复杂度 | 硬件友好 | 典型 4-bit 质量 |
|------|----------|--------|----------|----------------|
| GPTQ | 二阶补偿、逐列 | 高（需 Hessian） | 中 | 优 |
| AWQ | 保护重要通道 | 低 | 优 | 优 |
| RTN（朴素） | 直接舍入 | 极低 | 优 | 差 |

## 六、常见误区

- **AWQ 只保护重要通道是浪费**：恰恰是这 1% 通道主导输出，保护它们性价比最高。
- **GPTQ 一定要最准**：其补偿依赖标定数据质量，标定差则退化，且是按层独立优化。
- **W4 不量化激活就够快**：W4A16 仍受激活带宽限制，端到端提速有限。
- **量化后即无损**：4-bit 对难任务仍有可测掉点，需按任务验证。
- **两者互斥**：实践中可按层混用，或先做 AWQ 保护再做 GPTQ 补偿。

## 七、与开源书·权威来源对应

- Frantar et al., *GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers*, 2022。
- Lin et al., *AWQ: Activation-aware Weight Quantization for LLM Compression*, 2023。
- llm-course「Quantization」；与本系列「INT8量化」「量化基础」互补。

## 八、面试题

1. AWQ 为何只保护「重要通道」而不是全部量化？依据是什么？
2. GPTQ 的 Hessian/二阶补偿解决了什么朴素量化解决不了的问题？
3. GPTQ 与 AWQ 在工程实现复杂度与硬件友好度上的差异？
4. 为何 W4A16 部署仍可能不快？激活量化何时必要？

## 九、演进与趋势

GPTQ/AWQ 后涌现混合方案：SpQR（分离离群权重）、OWQ（针对权重的异常保护）、以及把两者思想结合的「旋转量化（QuaRot/SpinQuant）」用旋转矩阵消除激活离群，使 W4A4 也可行。趋势是「算法-内核协同」——量化格式与 GPU 张量核心指令深度绑定，让 4-bit 真正端到端加速，而非仅省显存。

## 十、小结

GPTQ 与 AWQ 是 4-bit 权重量化双主流：GPTQ 用二阶 Hessian 补偿逐列量化误差，精度优但实现复杂；AWQ 按激活幅度保护极少数关键通道，简单高效且硬件友好。两者都支持一次标定部署、无需重训。落地可按「后端支持度 + 精度需求」二选一，并配合 W4A8 激活量化进一步提速，必要时按层混合两者之长。
