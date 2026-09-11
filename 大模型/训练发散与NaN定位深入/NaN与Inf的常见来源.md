# NaN与Inf的常见来源

> 对应 IEEE 754 浮点标准与 pytorch/pytorch `torch.autograd.set_detect_anomaly` 调试文档。

## 一、背景与挑战

NaN（Not a Number）与 Inf（无穷）是浮点运算的两类非有限值。它们一旦进入模型参数，就会通过后续所有前向/反向传播扩散，使整个网络输出全部污染——因为 NaN 具有「传染性」：任何与 NaN 的算术运算结果都是 NaN。

训练中出现 NaN 的麻烦在于来源众多：可能来自坏数据样本、前向算子、反向梯度、优化器更新，也可能来自混合精度缩放。若不系统排查而直接从头重训，问题往往会在同一位置复现，既浪费算力又无法根治。

## 二、核心原理

按 IEEE 754 定义，非有限值的产生规则高度确定，可归纳为几类：

1. **非法运算**：$0/0$、$\infty - \infty$、$\infty \times 0$、$\sqrt{-1}$ 均产生 NaN；
2. **溢出**：结果超出可表示范围产生 $\pm\infty$，如 FP16 中 $\exp(z),\ z>88$；
3. **除零**：$x/0$ 在 $x \ne 0$ 时得 $\pm\infty$，$0/0$ 得 NaN；
4. **对数/开方定义域越界**：$\log(0) = -\infty$，$\log(\text{负数}) = \text{NaN}$，$\sqrt{\text{负数}} = \text{NaN}$；
5. **上溢下溢交互**：混合精度下梯度下溢为 0，随后参与除法产生 NaN。

排查应按**训练流水线的阶段**进行：数据输入 → 前向 → 损失 → 反向 → 优化器更新 → 检查点恢复。每阶段都可插入有限性断言，把「首个产生非有限值的位置」精确定位出来。

## 三、形式化与数学基础

IEEE 754 的关键传播性质：

$$
\text{NaN} \odot x = \text{NaN}\ \ \forall x,\ \forall \odot;\qquad
\infty - \infty = \text{NaN},\quad \infty \times 0 = \text{NaN},\quad \frac{0}{0} = \text{NaN}
$$

危险算子的边界条件：$\log p \to -\infty\ (p\to0^+)$、$\log p \to \text{NaN}\ (p<0)$、$x/(\sqrt{\text{Var}}+\epsilon) \to x/\epsilon$。FP16 的 $\exp$ 溢出边界为 $\exp(z) > 65504 \iff z > \ln 65504 \approx 11.09$；实践中用 $\epsilon$ 兜底除零、用 `clamp_min` 兜底对数定义域：

$$
\log(\max(p,\ \epsilon)),\qquad \frac{x}{\sqrt{v} + \epsilon}
$$

判别「NaN 还是 Inf」也很关键：Inf 往往提示溢出/除零，NaN 则更可能是 $0/0$ 或 $\infty-\infty$，二者指向不同根因。

## 四、代码实现

```python
# 分阶段有限性检查：输入 -> 前向 -> loss -> 梯度
import torch

def check(tag, t):
    if t is None or not torch.is_tensor(t):
        return
    if torch.isnan(t).any():
        raise RuntimeError("NaN at " + tag)
    if torch.isinf(t).any():
        raise RuntimeError("Inf at " + tag)

# 阶段 1：数据
for x, y in loader:
    check("input.x", x)
    check("label.y", y)

    # 阶段 2：前向
    logits = model(x)
    check("forward.logits", logits)

    # 阶段 3：损失
    loss = criterion(logits, y)
    check("loss", loss)

    # 阶段 4：反向
    loss.backward()
    for n, p in model.named_parameters():
        check("grad." + n, p.grad)
    break
```

```python
# 用 autograd 异常检测定位产生 NaN 的算子（开销大，仅排障用）
with torch.autograd.set_detect_anomaly(True):
    loss = model(x).loss
    loss.backward()          # 报错时会打印产生非有限值的算子栈
```

## 五、与其他技术对比

| 非有限来源 | 典型算子 | 结果类型 | 排查手段 |
| --- | --- | --- | --- |
| 除零 | LayerNorm、归一化 | Inf / NaN | 加 $\epsilon$、断言方差 > 0 |
| log 定义域 | 交叉熵、KL | $-\infty$ / NaN | `clamp_min`、mask 处理 |
| exp 溢出 | softmax、sigmoid | Inf | 减最大值、提高精度 |
| 混合精度上溢 | FP16 反向 | Inf | 调 scale、改 BF16 |
| 坏样本 | 数据加载 | NaN | 输入校验、跳过坏 batch |
| 梯度爆炸 | 深层连乘 | Inf → NaN | 梯度裁剪、归一化 |

## 六、常见误区

- **看到 NaN 就重训**：应先定位阶段，否则同一根因会重复触发。
- **混用 NaN 与 Inf 判断**：两者根因不同，应分开断言以获得更精确线索。
- **忽略输入数据**：坏样本（含 NaN 或异常大值）是常被忽视的源头。
- **`sqrt` 负数不处理**：数值误差可让本应非负的方差略微为负，`sqrt` 即 NaN。
- **只在 loss 上检查**：中间层早已坏而 loss 可能因巧合仍有限。
- **认为 `nan_to_num` 是解决**：它只是掩盖症状，会把错误值静默替换，掩盖根因。

## 七、与开源书·权威来源对应

IEEE 754 浮点标准规定了 NaN/Inf 的表示与传播规则；pytorch/pytorch 的 `torch.autograd.set_detect_anomaly` 与 `torch.nan_to_num` 文档给出调试与兜底接口；Bryant & O'Hallaron《CSAPP》第 2 章讲解浮点表示与特殊值。混合精度相关可参照 Micikevicius 2018《Mixed Precision Training》(arXiv:1710.03740)。具体 API 语义以官方最新文档为准。

## 八、面试题

- **问：NaN 与 Inf 的产生条件有何不同？** 答：Inf 多来自溢出与除零；NaN 多来自 $0/0$、$\infty-\infty$、$\infty\times0$ 与定义域越界。
- **问：为什么 NaN 会「传染」？** 答：IEEE 754 规定任何与 NaN 的算术运算结果均为 NaN。
- **问：层归一化如何避免除零 NaN？** 答：分母加小 $\epsilon$，并对极小方差情形做下界保护。
- **问：交叉熵如何处理 $\log(0)$？** 答：对概率 `clamp_min(eps)` 或使用内置数值稳定的 `log_softmax` 实现。

## 九、演进与趋势

工具层面，`set_detect_anomaly`、逐模块有限性钩子、以及各训练框架内建的健康检查正在把 NaN 定位自动化；精度层面，BF16/TF32 的普及降低了溢出型 NaN 的概率，但不会消除逻辑型（除零、定义域）NaN。未来趋势是「编译器级插桩」——在 `torch.compile` 等编译阶段自动注入边界断言，在不显著损失性能的前提下实现全程数值可观测。

## 十、小结

NaN/Inf 的产生遵循确定性的浮点规则，可按「输入 → 前向 → loss → 反向 → 更新」分阶段定位。工程上的标准做法是：在关键边界插入有限性断言、对除零与定义域加 $\epsilon$ 与 clamp、监控 grad_norm 与 scale、用异常检测工具锁定首个算子。系统排查远比盲目重训更省算力，也更能根治问题。
