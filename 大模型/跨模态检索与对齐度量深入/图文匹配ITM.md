# 图文匹配ITM

> 对应 视觉语言预训练（如 Li et al. 2021 「ALBEF」、BLIP 系列）中 Image-Text Matching 任务。

## 一、背景与挑战

检索用相似度排序，而图文匹配（ITM）是二分类：判断图文是否配对。ITM 提供细粒度对齐信号，但需负样本构造。挑战是负样本难度与训练目标组合。

## 二、核心原理

在融合编码器（cross-attention 或多模态 encoder）后接二分类头输出匹配概率。训练时用 in-batch 负样本或 hard negative。常与对比（ITC）与语言建模（LM）联合训练（如 ALBEF 三损失），ITM 用对齐后的多模态表示。

## 三、数学形式

给定图文对 (v,t)，融合表征 h=\mathrm{Enc}(v,t)，匹配概率：
p = \sigma(W\,h + b)
损失为二分类交叉熵 L_{ITM}=-\log p_{y}，y=1 正对、0 负对。Hard negative 通过对比得分挑最易混淆负对。

## 四、代码实现

```python
import torch.nn as nn

class ITMHead(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.cls = nn.Linear(dim, 2)
    def forward(self, h):
        return self.cls(h[:,0])             # 取 [CLS] 表征
```

## 五、与其他对比

相比 ITC（排序），ITM 是配对判别、更细粒度；BLIP 用 ITM 做 filter 清洗 web 数据；二者互补，联合训练效果最佳。

## 六、常见误区

以为 ITM 可替代检索，实则二者目标不同；忽略 hard negative 提升；混淆单塔与双塔结构；未与 ITC 联合致表征弱。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：ITM 与 ITC 区别？答：ITM 配对二分类，ITC 相似度排序。
- Q：hard negative 作用？答：提升判别难度，学细粒度。
- Q：BLIP 如何用 ITM？答：作 filter 清洗噪声图文对。

## 九、演进

从单 ITM 到 ITC+ITM+LM 多任务；从随机负到难负挖掘；用于数据清洗与检索重排。

## 十、小结

图文匹配以二分类提供细粒度对齐监督，与对比目标互补，是多模态预训练与数据清洗的核心组件。
