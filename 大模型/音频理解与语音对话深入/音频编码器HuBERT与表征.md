# 音频编码器HuBERT与表征

> 对应 Hsu et al. 2021 「HuBERT: Hidden-Unit BERT」及 Whisper 编码器相关工作。

## 一、背景与挑战

语音表征需同时捕获声学内容与说话人等副语言信息。监督表征依赖转录文本，规模受限。自监督通过预测隐藏单元（如聚类 pseudo-label）学习通用表征，但聚类目标与 masked 预测协同不稳定。

## 二、核心原理

HuBERT 用离线聚类（如 k-means 于 MFCC 或中间特征）生成 pseudo-label，再以 BERT 式 masked 预测目标训练。其创新在于用聚类标签而非连续特征作预测目标，迫使模型学习语义聚类边界，迭代式重聚类可逐步提升表征质量。

## 三、数学形式

对声学序列 X，掩码集合 M，伪标签 \hat{y} 来自聚类。损失：
L = -\sum_{t\in M}\log p_\theta(\hat{y}_t \mid X_{\setminus M})
即仅在掩码位置预测聚类标签，未掩码位置用于上下文建模。

## 四、代码实现

```python
import torch, torch.nn as nn

class MaskedPred(nn.Module):
    def __init__(self, dim, n_clusters):
        super().__init__()
        self.head = nn.Linear(dim, n_clusters)
    def forward(self, h, mask):
        logits = self.head(h)
        return logits[mask]                 # 仅对掩码帧算损失
```

## 五、与其他对比

相比 wav2vec 2.0 预测量化连续表征，HuBERT 预测离散聚类标签，语义更清晰；相比 data2vec，目标为上下文表示；相比 Whisper 编码器（弱监督），HuBERT 纯自监督、更轻量，常作下游 ASR/情感特征。

## 六、常见误区

以为聚类标签即真值，实则伪标签含噪；忽略迭代聚类提升；混淆 mask 比例对收敛影响；误用最终层而非中间层作表征。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：HuBERT 与 wav2vec2 区别？答：前者预测离散聚类标签，后者预测量化表征。
- Q：为何迭代聚类？答：更好伪标签提升表征语义性。
- Q：掩码预测作用？答：迫使模型从上下文推断，学通用表征。

## 九、演进

HuBERT 迭代式、large 版；与 LLM 结合做语音理解；多语种 XLS-R 扩展；作为语音 tokenizer 用于语音生成。

## 十、小结

HuBERT 用聚类伪标签 + 掩码预测的自监督方案，产出了强语义语音表征，是语音模态接入多模态大模型的重要音频编码器之一。
