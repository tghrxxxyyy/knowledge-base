# 多模态嵌入与 CLIP 式检索

> 对应 huggingface/transformers 多模态模型与 facebookresearch/faiss 向量检索。

## 一、背景与挑战
文本 RAG 无法处理图像、图表等视觉知识。多模态嵌入把图像与文本映射到共享空间，使「以文搜图、以图搜文、跨模态检索」成为可能。

## 二、核心原理
CLIP 类模型用对比学习对齐图像编码器与文本编码器，使匹配图文对向量相近。检索时把查询（文或图）编码，在共享空间近邻搜索另一模态的索引。

## 三、形式化与数学基础
对比目标（图文对齐）：
$\mathcal{L} = -\frac{1}{B}\sum_i \log \frac{\exp(\text{sim}(I_i,T_i)/\tau)}{\sum_j \exp(\text{sim}(I_i,T_j)/\tau)}$
推理时相似度 $\text{sim}(I,T)=E_I(I)^\top E_T(T)$。

## 四、代码实现
```python
from transformers import CLIPModel, CLIPProcessor
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
def img_search(query_emb, img_index, k=5):
    return img_index.search(query_emb, k)   # 共享空间近邻
```

## 五、与其他技术对比
相比纯文本嵌入，多模态嵌入检索面更广；相比传统 CV 特征，CLIP 零样本泛化强。代价是需多模态索引与更大存储。

## 六、常见误区
误区一：多模态检索只需图像向量，实则常需文本侧查询。误区二：忽视模态对齐误差，跨模态近邻可能语义漂移。

## 七、与开源书/权威来源对应
- huggingface/transformers 提供 CLIP 等实现。
- facebookresearch/faiss 支持多模态向量检索。
- Lewis et al. 2020 检索增强思想延伸。

## 八、面试题
1. CLIP 对比损失为何用温度 tau？
2. 跨模态检索的主要失败模式？
3. 如何评估多模态检索质量？

## 九、演进与趋势
出现更强视觉语言模型（如 BLIP、SigLIP）与区域级检索（以图块为单位），并把检索结果直接供多模态生成。

## 十、小结
CLIP 式共享嵌入是多模态 RAG 的基石，打通了文本与图像的检索壁垒。
