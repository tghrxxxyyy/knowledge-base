# LoRA原理

> 对应 Hu et al., *LoRA: Low-Rank Adaptation*, 2021。

## 一、背景与挑战

权重更新矩阵 $\Delta W$ 满秩且巨大；低秩假设下可用小矩阵分解近似，大幅降参。

## 二、核心原理

对权重 $W\in\mathbb R^{d\times k}$，设 $\Delta W = B A$，$B\in\mathbb R^{d\times r}, A\in\mathbb R^{r\times k}$，$r\ll\min(d,k)$。
前向：$h = W x + \Delta W x = W x + B A x$。仅训 $A,B$。

## 三、数学形式

可训练参数从 $d\times k$ 降至 $r(d+k)$；推理可把 $BA$ 合并回 $W$（无额外延迟）。

## 四、代码实现

```python
class LoRA(nn.Module):
    def __init__(s, d, k, r):
        s.A = nn.Parameter(torch.randn(r, k)/k**0.5)
        s.B = nn.Parameter(torch.zeros(d, r))
    def forward(s, x, W):
        return W(x) + (x @ s.A.T @ s.B.T)
```

## 五、与其他对比

- 比 Adapter 少插入层、无序列延迟；比 Prompt Tuning 更易优化。
- 与 权重初始化理论深入 相关（$A$ 初始化、 $B$ 零初始化使起点为原模型）。

## 六、常见误区

- 秩 $r$ 越大越好是误区；过大易过拟合且失 PEFT 优势。
- 忽略把 LoRA 合并回权重前的多适配器切换成本。

## 七、与开源书对应

- llm-course LoRA：https://github.com/mlabonne/llm-course

## 八、面试题

- 为什么 $B$ 常初始化为零？答：使初始 $\Delta W=0$，训练从原模型出发稳定。

## 九、演进

LoRA → QLoRA（4-bit 底座）→ DoRA → 多种秩分配策略。

## 十、小结

LoRA 用低秩分解近似权重更新，是性价比最高的 PEFT 方法，已被广泛采用。
