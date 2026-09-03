# 物体幻觉POPE评测

> 对应 Li et al. 2023 「Evaluating Object Hallucination in Large Vision-Language Models」(POPE)。

## 一、背景与挑战

多模态大模型常描述图像中不存在的物体（物体幻觉），损害可信度。问题在于缺乏统一、客观的评测。POPE 提出以二元轮询（yes/no）形式评测物体是否存在的幻觉，使评测可量化、可对比。

## 二、核心原理

POPE 构造问题「Is there a <object> in the image?」。正样本取图中真实物体，负样本取随机/流行/同类物体。模型回答 yes/no，用准确率、精确率、召回率、F1 衡量。因是简单二元题，可剥离语言先验干扰，暴露模型是否真正看图。

## 三、数学形式

设正例数 P、负例数 N，预测正为 \hat{P}。指标：
\mathrm{Acc}=\frac{TP+TN}{P+N},\quad F1=\frac{2PR}{P+R}
其中 P=\frac{TP}{TP+FP}, R=\frac{TP}{TP+FN}。负样本采样分 random / popular / adversarial 三档，难度递增。

## 四、代码实现

```python
def pope_metrics(preds, labels):
    tp = sum(p==1 and l==1 for p,l in zip(preds,labels))
    fp = sum(p==1 and l==0 for p,l in zip(preds,labels))
    fn = sum(p==0 and l==1 for p,l in zip(preds,labels))
    prec = tp/(tp+fp); rec = tp/(tp+fn)
    return 2*prec*rec/(prec+rec+1e-9)
```

## 五、与其他对比

相比 CHAIR（基于生成描述的物体命中率），POPE 更可控、无生成自由度干扰；相比开放式问答评测，二元更客观。POPE 已成为 MLLM 幻觉标准基准之一。

## 六、常见误区

以为高描述流畅即无幻觉；忽略负样本采样策略影响难度；用准确率单一指标忽略不平衡；混淆幻觉与错误识别。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：POPE 如何评测幻觉？答：yes/no 物体存在轮询，F1 量化。
- Q：三种负采样？答：随机、流行、对抗，难度递增。
- Q：为何用二元？答：剥离生成自由度，客观可比。

## 九、演进

从 POPE 到更细粒度（属性、关系）幻觉评测；与缓解方法（见后续文档）联动。

## 十、小结

POPE 用简洁二元轮询把物体幻觉变为可量化指标，为诊断与改进 MLLM 提供了标准化尺子。
