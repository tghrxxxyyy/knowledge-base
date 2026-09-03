# 视频QA数据集与评测

> 对应 MSVD-QA、MSRVTT-QA（Xu et al. 2017）及 ActivityNet-QA（Yu et al. 2019）等基准。

## 一、背景与挑战

视频 QA 评测模型对时空内容的理解。不同数据集侧重不同：MSVD/MSRVTT 偏描述与物体，ActivityNet 偏长视频活动。挑战在于开放域问答、时序推理与细粒度事件定位的公平评测。

## 二、核心原理

数据集通常由视频 + 问题 + 答案（多选或开放）构成。评测指标：多选题用准确率；开放题用 BLEU、METEOR、CIDEr 或 GPT 裁判。Video-ChatGPT 提出结构化评测维度（正确性、细节、上下文、时序、一致性）。

## 三、数学形式

多选题准确率：A = \frac{1}{M}\sum_{i=1}^M \mathbb{1}[\hat{a}_i=a_i]。开放题与参考对齐常用 CIDEr：
CIDEr = \frac{1}{n}\sum_{n_g} \frac{\mathbf{g}\cdot\mathbf{r}_{ij}}{\|\mathbf{g}\|\|\mathbf{r}_{ij}\|}
其中 \mathbf{g} 为 TF-IDF 词向量。

## 四、代码实现

```python
def accuracy(preds, gts):
    return sum(p == g for p, g in zip(preds, gts)) / len(gts)

def eval_open(pred, ref):
    from nltk.translate.bleu_score import sentence_bleu
    return sentence_bleu([ref.split()], pred.split())
```

## 五、与其他对比

相比图像 QA（VQA v2），视频 QA 增时间维与因果；相比动作识别（Kinetics），QA 需语言推理；结构化评测比单一准确率更能反映能力维度。

## 六、常见误区

用 BLEU 衡量视频答案不敏感语义；忽略多选题随机基线；混淆描述能力与推理能力；以单数据集结论泛化。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：视频 QA 与图像 QA 区别？答：增加时序理解与事件推理。
- Q：常用指标？答：多选准确率、BLEU/CIDEr、GPT 裁判。
- Q：ActivityNet 特点？答：长视频活动问答，考察长程理解。

## 九、演进

从短片段到长视频；从多选到开放 + 推理；引入时序定位与因果题。

## 十、小结

视频 QA 基准体系从描述走向推理与长程理解，结构化多维评测正成为衡量视频大模型能力的标准范式。
