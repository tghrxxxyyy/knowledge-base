# CLIP 对比学习

> 对应 Radford et al., *Learning Transferable Visual Models From Natural Language Supervision* (ICML 2021，CLIP)；OpenAI CLIP 代码与 ViT-B/32 等权重；「多模态深入/视觉语言模型综述」「Stable_Diffusion架构」中把 CLIP 作为文本条件编码器的用法；与「大模型与知识图谱/GraphRAG」中图文检索链路相关。零样本视觉与对比学习的骨干方法。

## 一、背景与挑战

监督图像分类长期依赖**固定标签集**：ImageNet 1000 类训练的模型无法直接回答「一张图是不是 red panda」，除非该类在训练集里。换数据集要重训、标签命名与 prompt 语义脱节、细粒度与开放词汇场景（open-vocabulary）几乎无解。

CLIP（Contrastive Language-Image Pre-training）的出发点：互联网上已有海量「图 + 自然语言描述」，不必绑死人工类别，而是学一个**共享嵌入空间**——图像和它的文字说明靠近，和无关文字远离。训练完后，分类变成「图嵌入与各类别 prompt 嵌入比相似度」，**标签集在推理时才确定**，从而零样本迁移到几乎任意任务。

真正难的是：(1) 4 亿级图文对的对比目标怎么设计才不塌缩；(2) 零样本 prompt 怎么写才不被分布偏移坑；(3) 如何在 ImageNet 监督基线上「不掉点」甚至反超——CLIP 用 InfoNCE 双向对比 + 丰富 prompt 模板给出了工程上可用的答案。

## 二、核心原理

### 2.1 双塔结构

- **Image Encoder**：ResNet-50 或 ViT（ViT-B/32、ViT-L/14…），输出 $f(x)\in\mathbb{R}^d$。
- **Text Encoder**： Transformer（64 层类 GPT 结构，77 token 上下文），取 EOT 位置嵌入 $g(y)\in\mathbb{R}^d$。
- 两塔**不交叉注意力**，只在最后一层做投影后的内积相似度：

$$ s_{ij} = \frac{f(x_i)^\top g(y_j)}{\tau} $$

独立双塔的代价是「图文对齐更难」，收益是**图像塔与文本塔都可以单独部署**——文生图拿文本塔当条件，检索系统两塔可离线建索引，这正是后来 SD、ALIGN、SigLIP 等都沿用或变体双塔的原因。

### 2.2 对比学习目标（双对称 InfoNCE）

batch 内 $N$ 个对，构造 $N\times N$ 相似度矩阵，对角线为正样本：

$$ \mathcal{L}=\frac{1}{2N}\sum_{i=1}^{N}\Big[ -\log\frac{e^{s_{ii}}}{\sum_j e^{s_{ij}}} - \log\frac{e^{s_{ii}}}{\sum_j e^{s_{ji}}} \Big] $$

第一项：给定图找正确文（image→text）；第二项：给定文找正确图（text→image）。**温度 $\tau$** 控制分布尖锐程度：$\tau$ 小则对难负样本更敏感，学习更细粒度但可能训练不稳；CLIP 中 $\tau$ 是可学习参数并 clamp 在合理范围。

为何不能只让正样本相似度大？若不放负样本，所有嵌入会塌缩到一点（collapse）。InfoNCE 的分母强制「批内其他图文对成为负例」，大 batch 提供更多难负样本——CLIP 用 32k 级 batch，对比学习对 batch 规模敏感。

### 2.3 零样本分类与 prompt

把类别名填进模板：`"a photo of a {label}"`（可枚举多种模板再平均 logit）。图与各 prompt 算相似度后 softmax 得类别分布。对细粒度任务，换更贴切的模板（`"a photo of a {label}, a type of pet"`）常能涨点——这被称为 **prompt engineering for vision**，与 NLP 的 prompt 思想同源。

## 三、形式化与数学基础

设 $Z_1=f(x), Z_2=g(y)$ 为两塔归一化（或投影后）表示，则对称交叉熵等价于：

- 把 $Z_1^\top Z_2$ 视为 logits 的分类损失（行方向 + 列方向）；
- 与监督分类相比，**类别 = batch 内的样本索引**，每步动态变化，属于实例判别式自监督/多模态监督的交叉。

**温度与梯度**：$\partial \mathcal{L}/\partial s_{ij}$ 含 softmax 权重，难负例（$s_{ij}$ 大且非对角）获得更大梯度，这解释了「batch 越大、任务越难，表示越细」。

**线性探测（linear probe）**：冻结视觉塔，在下游数据上训线性分类器，用于衡量表征质量而不做微调——CLIP 报告中与 ImageNet 全监督对比的主表之一。

**与对比式自监督（SimCLR/MoCo）差异**：SimCLR 只在视觉增广视图间对比；CLIP 把**自然语言**当监督信号，文本的组合性让「未见过的类别组合」也可用词向量表达，这是零样本能力的来源。

## 四、代码实现

```python
# 零样本分类（OpenAI CLIP，示意）
import torch, clip
from PIL import Image

device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-L/14", device=device)

image = preprocess(Image.open("panda.jpg")).unsqueeze(0).to(device)
texts = clip.tokenize(["a photo of a red panda", "a photo of a raccoon",
                       "a photo of a dog"]).to(device)

with torch.no_grad():
    image_features = model.encode_image(image)
    text_features = model.encode_text(text)
    image_features /= image_features.norm(dim=-1, keepdim=True)
    text_features  /= text_features.norm(dim=-1, keepdim=True)
    logits = (100.0 * image_features @ text_features.T).softmax(dim=-1)
print(logits)  # 取 argmax 即零样本预测

# 训练侧损失核心（双对称 InfoNCE）
# logits = image_feat @ text_feat.T / tau
# labels = torch.arange(B)
# loss = (F.cross_entropy(logits, labels) + F.cross_entropy(logits.T, labels)) / 2
```

生产注意：`tokenize` 上下文 77，超长 caption 会截断；相似度前是否 L2 归一化必须与训练一致；跨模态检索时图像库特征可预计算，文本查询在线算即可。

## 五、与其他技术对比

| 维度 | 监督 ImageNet | CLIP 零样本 | ALBEF/BLIP（ITM+ITC） | SigLIP |
| --- | --- | --- | --- | --- |
| 标签来源 | 固定 1000 类 | 推理时 prompt | 图文对 + 对齐损失 | 图文对 |
| 零样本 | 无 | **强** | 中 | 强（sigmoid 对比） |
| 开放词汇检索 | 差 | **原生** | 好 | 好 |
| 训练复杂度 | 中 | 高（大数据+大 batch） | 高 | 高 |
| 后续影响 | 分类基线 | SD 条件、检索、检测提示 | 多模态理解 | 更稳对比 |

与 **词包分类（Linear probe on ImageNet）**：CLIP 的线性探测接近监督基线，但分布外与长尾通常更稳。与 **目标检测里的 RegionCLIP/Grounding**：把 CLIP 扩到开词表检测。与 **SigLIP**：用 sigmoid 替代 softmax 对比，缓解 batch 内全局归一化，小 batch 更友好。

## 六、常见误区

1. **CLIP 是生成模型**——它是双塔判别式嵌入模型，不生成图像；文生图是 SD 拿它的文本塔当条件。
2. **零样本完全免费**——训练成本极高（大规模数据与算力），「零样本」指推理阶段无标注微调。
3. **prompt 随便写不影响结果**——模板与连词显著影响细粒度与分布偏移场景；标准模板集 + 校准是常规操作。
4. **相似度不用归一化也行**——长度偏置会主导内积，与训练不一致时检索排序会错。
5. **CLIP 在所有分布外都更强**——仍会受职业、文化、OCR 文字、水印等偏见与幻觉影响，安全场景需额外评测。
6. **拿 CLIP 分数当事实可信度**——它是相关性不是真实性，高分只说明「图文语义匹配」。

## 七、与开源书·权威来源对应

- Radford et al., ICML 2021（CLIP 原论文与 prompt 模板附录）。
- OpenAI/CLIP 仓库、open_clip_torch 复现（OpenCLIP，SDXL 使用）。
- Radford et al., *Zero-Shot Transfer with CLIP* 相关教程；Lavis、Transformers 文档中的 CLIP 类。
- Rombach et al. LDM 论文中 CLIP 文本塔作为条件的用法。
- dair-ai / 多模态综述中对比学习与 InfoNCE 推导。

## 八、面试题

**1. CLIP 如何实现零样本分类？**  
要点：训练阶段用图文对比学共享空间；推理把类别填入 prompt，算图像与各文本嵌入相似度取最大。类别集合可任意更换，无需重训。

**2. 温度 $\tau$ 起什么作用？**  
要点：缩放相似度 logits，控制 softmax 集中度与难负样本梯度权重；太小训练尖锐易数值问题，太大则分辨力弱；CLIP 可学习 $\tau$ 并限制范围。

**3. 为什么 batch 必须大？**  
要点：InfoNCE 负样本来自 batch 内其他对，batch 小则负例少、信号弱；大 batch 提供难负例并稳定对比估计。

**4. 双塔为何不做 cross-attention？**  
要点：换独立部署与大规模检索效率（离线建库、单塔编码）；对齐难度由对比损失和数据规模消化，后续 BLIP-2 等在桥接阶段再引入交叉。

**5. CLIP 与监督分类 ImageNet 比谁强？**  
要点：同分布 top-1 接近或略低，但开放集、长尾、新类别与跨数据集迁移上通常更好；评价指标不能只看 ImageNet 1k。

## 九、演进与趋势

- **更强文本塔**：Flamingo、BLIP-2、Qwen-VL 系把 LLM 接进视觉，从「对比对齐」走向「生成式理解」。
- **对比损失变体**：SigLIP（sigmoid）、CyCL、区域级对比（检测框与短语对齐）。
- **高效训练**：OpenCLIP 复现、LAION 数据集、渐进分辨率与更长训练，社区化重跑大 CLIP。
- **检索与 Agent 工具**：CLIP 向量库做以图搜图、多模态 RAG 召回；再交给 LLM 重排。
- **安全与对齐**：CLIP 相似度被用于 NSFW 过滤、水印与内容审核的第一道门，偏见与假阴性成为产品必测项。

## 十、小结

CLIP 用**双塔 + 双对称 InfoNCE + prompt 化分类**，把视觉从固定标签集里解放成开放词表的嵌入空间。理解它要抓三条线：**对比目标为何要负样本与大 batch**、**零样本为何等于「推理时拼 prompt 比相似度」**、**双塔设计为何服务检索与条件生成**。它既是最常用的多模态基线，也是 SD 文本条件、多模态 RAG 与开词表检测的共同上游——读完本篇再看 LDM 与 VLM，条件注入的链路会非常清楚。
