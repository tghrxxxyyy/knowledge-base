# 直接贡献分解与logit归因

> 对应 Elhage et al., 2021（可加分解）；Wang et al., IOI, ICLR 2023（direct logit attribution 实践）。

## 一、背景与挑战

要回答「哪个头/哪层把答案推上去了」，需要把最终 logit 差拆成各组件的直接贡献，而非只看激活大小。

## 二、核心原理

利用残差流可加性，把每个组件输出沿目标方向投影，即得该组件对目标 logit 差的直接贡献。

- 目标方向取 $W_U$ 中目标 token 与对照 token 的差向量，投影结果可正可负、可加总。
- 「直接」意味着只计入该组件经残差直达输出的路径，不含其被后续层再加工的间接影响。

## 三、数学形式

令方向 $u=W_U[y^\ast,:]-W_U[y^{alt},:]$，组件 $c$ 的直接贡献为 $\mathrm{DLA}(c)=\dfrac{\langle z_c,\ u\rangle}{\sigma_{LN}}$。

且有 $\sum_c \mathrm{DLA}(c)=\mathrm{logit}(y^\ast)-\mathrm{logit}(y^{alt})$（在固定 LayerNorm 缩放近似下成立）。

## 四、代码实现

```python
import torch
def dla(components, W_U, tgt, alt, ln_scale=1.0):
    u = W_U[tgt] - W_U[alt]
    return {name: float(z @ u / ln_scale) for name, z in components.items()}
comps = {"head0.1": torch.randn(8), "mlp0": torch.randn(8)}
print(dla(comps, torch.randn(5, 8), 1, 2))
```

## 五、与其他对比

- 与激活修补对照：DLA 便宜且可加，但只覆盖直接路径；patching 能捕获间接影响。
- 与 Logit Lens 对照：lens 读状态，DLA 读增量贡献，后者更适合定位「谁在推」。

## 六、常见误区

- 忽视 LayerNorm 缩放导致贡献量级失真、加总不闭合。
- 只看 DLA 就下结论；某组件可能主要通过下游组件间接起作用，直接贡献接近零。

## 七、与开源书对应

- harvardnlp/annotated-transformer（输出投影与残差写入的对应代码）：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch（提取每个子层输出的实现方式）：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- DLA 为什么可加？答：残差流是加法结构，logit 对各写入项线性，故投影可加总闭合。
- DLA 漏掉了什么？答：间接路径贡献，需路径 patch 或迭代分解补足。

## 九、演进

激活幅值观察 → 方向投影的直接归因 → 与路径 patch 结合的完整归因 → 自动化电路报告。

## 十、小结

直接 logit 归因是成本最低的定量归因工具，但需牢记它只解释直接路径。
