# SwiGLU与变体

> 对应 Shazeer, *GLU Variants Improve Transformer*, 2020（提出 SwiGLU/GeGLU 并在 T5 等验证更优）。

## 一、背景与挑战

GLU 的 sigmoid 门在深度网络中梯度偏饱和；需更平滑、信息更丰富的门函数以进一步提升 FFN 质量。

## 二、核心原理

SwiGLU 用 Swish（SiLU）替 sigmoid 作门：$a\odot\text{Swish}(b)$，其中 $\text{Swish}(x)=x\sigma(\beta x)$，通常 $\beta=1$。

## 三、数学形式

$\text{SwiGLU}(x)=(xW)\odot(xV\sigma(xV))$（简化），精确为 $\text{SwiGLU}(x,\beta)=(\text{Swish}_\beta(xW))\odot(xV)$，常需 LayerNorm 前置。

## 四、代码实现

```python
import torch.nn.functional as F
def swiglu(x, w1, w2, w3):
    a = F.silu(x @ w1) * (x @ w2)
    return a @ w3
```

## 五、与其他对比

- SwiGLU 在多数 Transformer 上优于 ReLU/GeLU FFN，且常配 RMSNorm 使用。
- 与 GLU 相比门更平滑，与 GeGLU 相比用 Swish 而非 GELU 门。

## 六、常见误区

- 忽略 SwiGLU 常在门控前加 LayerNorm（$a=\text{LayerNorm}(xW)$），裸用易不稳。
- 误以为 SwiGLU 不改变参数量：实际 FFN 中间维需重设以对齐计算预算。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 为何 SwiGLU 常优于 ReLU FFN？答：Swish 门平滑且非单调，增强特征路由能力。

## 九、演进

GLU → SwiGLU/GeGLU（2020）→ 成为 LLaMA/PaLM 等现代 LLM 默认 FFN。

## 十、小结

SwiGLU 以 Swish 门替换 sigmoid，是现代大模型 FFN 的事实标准激活变体。
