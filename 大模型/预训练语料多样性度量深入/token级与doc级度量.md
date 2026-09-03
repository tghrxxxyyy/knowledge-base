# token级与doc级度量

> 对应 预训练数据多样性度量的粒度研究。

## 一、背景与挑战

多样性可在 token 级(词表覆盖、n-gram 熵)或 doc 级(文档主题差异)度量。粒度不同，结论可能相反，需区分使用。

## 二、核心原理

token 级关注局部统计(词汇丰富度、zipf 偏移)，doc 级关注主题/结构差异。模型训练既需 token 丰富也需 doc 多样。

## 三、数学形式

token 级熵：

$$
H_{tok} = -\sum_v p(v)\log p(v)
$$

doc 级用嵌入簇内-簇间比：

$$
\mathrm{Sep} = \frac{1}{K}\sum_{k} \frac{1}{|C_k|}\sum_{x\in C_k} \| \phi(x)-\mu_k \|_2
$$

## 四、代码实现

```python
import torch

def token_entropy(counts):
    p = torch.tensor(counts).float()
    p = p / p.sum()
    return -(p * p.log()).sum().item()
```

## 五、与其他对比

token 级快但忽略语义；doc 级语义强但需嵌入，成本更高。

## 六、常见误区

误区：token 熵高即多样。可能是噪声或乱码抬高熵。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：两种粒度差异？答：token 看局部词汇，doc 看主题语义。
- Q：各自用途？答：token 监控训练信号，doc 指导配比。

## 九、演进

联合 token-doc 双粒度度量，形成综合多样性指标。

## 十、小结

粒度决定度量含义，应依目标选择合适的多样性层级。
