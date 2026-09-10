# Pre-Norm 与 Post-Norm 深度对比

> 对应 Xiong et al. 2020 与 annotated-transformer (Harvard NLP)。

## 一、背景与挑战

Transformer 可堆叠到数十甚至上百层，深层网络的训练稳定性是核心难题。
层归一化（LayerNorm）与残差连接的位置直接决定了梯度行为与数值稳定性。
原始 Transformer（Vaswani et al. 2017）采用 **Post-Norm**，而现代大模型（GPT-3、LLaMA、Qwen 等）普遍转向 **Pre-Norm**。
理解二者差异，是读懂当代架构演化的一把钥匙。

## 二、核心差异回顾

两种范式的残差块定义不同：

```
Post-Norm:  y = LayerNorm(x + F(x))
Pre-Norm :  y = x + F(LayerNorm(x))
```

- **Post-Norm** 把归一化放在残差相加之后，残差路径上的信号未经归一化，深层易出现梯度消失/爆炸，需谨慎的学习率 warmup。
- **Pre-Norm** 在子层前先做归一化，残差直接传递「原始尺度」信号，梯度在反向传播中更平滑，对深层更友好。
在 decoder-only 大模型里，Pre-Norm 还带来一个隐性好处：残差直连使深层表征的尺度更可控，便于后续的量化与知识蒸馏。

## 三、形式化与数学基础

设子层函数 $F$，对 Pre-Norm，第 $l$ 层输出：

$$
\mathbf{x}^{(l+1)} = \mathbf{x}^{(l)} + F\big(\text{LayerNorm}(\mathbf{x}^{(l)})\big)
$$

反向传播时，残差项 $+ \mathbf{x}^{(l)}$ 提供一条「恒等梯度通路」，使梯度范数在各层间更平稳。
对 Post-Norm，归一化作用在加和之后，恒等通路被归一化「打断」，深层梯度更易被压缩。
Xiong et al. (2020) 给出：在相同学习率下，Pre-Norm 的梯度范数方差更小，因而对学习率更鲁棒，warmup 阶段也更平稳。

## 四、代码实现

```python
import torch.nn as nn

class PreNormBlock(nn.Module):
    def __init__(self, d_model, sublayer):
        super().__init__()
        self.norm = nn.LayerNorm(d_model)
        self.sublayer = sublayer   # 如 MHA 或 FFN
    def forward(self, x, **kw):
        return x + self.sublayer(self.norm(x), **kw)

class PostNormBlock(nn.Module):
    def __init__(self, d_model, sublayer):
        super().__init__()
        self.norm = nn.LayerNorm(d_model)
        self.sublayer = sublayer
    def forward(self, x, **kw):
        return self.norm(x + self.sublayer(x, **kw))
```

## 五、与其他技术对比

| 方案 | 稳定性 | 表达力 | 深层友好 | 典型使用 |
|------|--------|--------|----------|----------|
| Post-Norm | 一般 | 较强 | 否 | 原始 Transformer |
| Pre-Norm | 强 | 略弱 | 是 | GPT/LLaMA/Qwen |
| Pre-Norm + 缩放 | 更强 | 中 | 是 | DeepNorm 等变体 |

## 六、常见误区

- 以为框架里默认的 `nn.Transformer` 就是 Pre-Norm；PyTorch 默认实现实为 Post-Norm，需手动调整。
- 认为 Pre-Norm「表达力更弱」是缺陷——实践中靠增加层数即可补偿，且稳定性收益远大于此。
- 把归一化位置与 RMSNorm 混为一谈：现代模型常把 LayerNorm 换成 RMSNorm，但 Pre 的位置约定不变。

## 七、与开源书·权威来源对应

- Xiong et al., *On Layer Normalization in the Transformer Architecture*, 2020（证实 Pre-Norm 更稳、对 LR 更鲁棒）。
- Vaswani et al., *Attention Is All You Need*, 2017（原 Post-Norm 设计）。
- Harvard NLP annotated-transformer 注释特别指出其实现与原论文 Pre/Post-Norm 的差异。

## 八、面试题

- 若把 Pre-Norm 改成 Post-Norm，训练动态会怎样变化？
- 为何现代大模型几乎一致选 Pre-Norm？
- Pre-Norm 的「恒等梯度通路」在反向传播中如何起作用？

## 九、演进与趋势

从 Post-Norm 到 Pre-Norm 再到「Pre-Norm + 残差缩放（如 DeepNorm / Root Mean Square 缩放）」以提升极深网络稳定性；归一化本身也从 LayerNorm 演进为 RMSNorm、把归一化移到注意力内部（如 GLU 变体），位置约定则基本固定在 Pre。
值得注意的是，Pre-Norm 在推理时残差路径直接相加，也使得深层表征的尺度更可控，便于量化与蒸馏。

## 十、小结

在真实训练中可观察到：Post-Norm 网络的激活尺度在深层容易失控，需要 warmup 把学习率从小逐渐抬升，否则初期梯度爆炸；而 Pre-Norm 即使较大学习率也较平稳，因此更易于规模化训练。
这也是为何 Megatron-LM、DeepSpeed 等大模型训练框架在堆叠数十层时默认采用 Pre-Norm 路线。

进一步，DeepNorm 提出对残差分支做缩放（$\text{DeepNorm}: x_{l+1}= \text{LayerNorm}(x_l + \alpha F(x_l))$），在保持 Pre-Norm 稳定性的同时逼近 Post-Norm 的表达力上限，使千层以上网络也能收敛。
归一化形式本身也从 LayerNorm 演进为 RMSNorm——去掉均值中心化、仅做缩放，计算更省且在大模型上表现相当，与 Pre 位置约定组合成当今事实标准。

Pre-Norm 与 Post-Norm 的本质差异在于归一化相对残差的位置：Pre 把归一化前置，换来深层训练的梯度平滑与稳定；Post 表达力略强但需更小心地 warmup。
现代大模型的一致选择印证了「稳定性优先」的工程哲学。
