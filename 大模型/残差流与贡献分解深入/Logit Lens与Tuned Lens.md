# Logit Lens与Tuned Lens

> 对应 nostalgebraist, *interpreting GPT: the logit lens*, 2020（技术博客）；Belrose et al., *Eliciting Latent Predictions with the Tuned Lens*, 2023。

## 一、背景与挑战

我们想知道模型在中间层「已经想到了什么」。直接用去嵌入矩阵读取中间残差是最朴素的办法，但存在层间表示尺度与基底漂移问题。

## 二、核心原理

Logit Lens 直接把中间层残差投到词表；Tuned Lens 为每层学一个仿射变换来校正漂移，使读出更可靠。

- Logit Lens：零训练成本，但浅层读出常噪声大甚至系统性偏移。
- Tuned Lens：以最小化与最终分布的 KL 为目标训练每层探针，显著改善浅层可读性与校准。

## 三、数学形式

Logit Lens：$\hat p^{(l)}=\mathrm{softmax}\big(W_U\,\mathrm{LN}(x_l)\big)$。

Tuned Lens：学 $A_l,b_l$ 使 $\hat p^{(l)}=\mathrm{softmax}\big(W_U(A_l x_l+b_l)\big)$ 且 $\min_{A_l,b_l}\ \mathbb{E}\,\mathrm{KL}\big(p_{final}\,\Vert\,\hat p^{(l)}\big)$。

## 四、代码实现

```python
import torch
class TunedLens(torch.nn.Module):
    def __init__(self, d):
        super().__init__(); self.A = torch.nn.Linear(d, d)
    def forward(self, x, W_U):
        return W_U @ self.A(x)
lens = TunedLens(8)
print(lens(torch.randn(8), torch.randn(5, 8)).shape)
```

## 五、与其他对比

- 与线性探针对照：探针预测任意标签，lens 专门预测最终 token 分布，可直接对比层间「预测轨迹」。
- 与 直接贡献分解与logit归因 衔接：lens 看状态，DLA 看增量，二者互补。

## 六、常见误区

- 把 Logit Lens 浅层的奇怪读出当作模型「早期判断」；那常是基底不匹配的伪影。
- 用 Tuned Lens 结果声称因果性；它仍是解码性证据，需 patching 补因果。

## 七、与开源书对应

- rasbt/LLMs-from-scratch（去嵌入与权重共享的实现细节）：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh（softmax、KL 散度与线性变换基础）：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Tuned Lens 解决什么问题？答：校正层间表示的基底与尺度漂移，使中间层读出可比可信。
- lens 类方法的局限？答：只证明可解码，不证明该信息被下游实际使用。

## 九、演进

直接去嵌入读出（2020）→ 仿射校正的 Tuned Lens（2023）→ 与 patching 联合的因果读出。

## 十、小结

Lens 类方法给出预测轨迹的可视化，但因果结论仍需干预实验支撑。
