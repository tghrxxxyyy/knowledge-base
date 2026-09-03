# Recall@k检索度量

> 对应 跨模态检索评测标准（MSCOCO、Flickr30K 检索基准）常用指标。

## 一、背景与挑战

检索系统需量化「相关结果是否进前 k」。Recall@k 衡量查全，但不反映排序质量；需与 mAP、median rank 等配合。挑战是双向检索（图搜文 / 文搜图）与指标口径统一。

## 二、核心原理

对每个查询，取相似度 top-k 候选，若其中包含真实相关项则计为命中。Recall@k 为命中查询占比。跨模态常报告 image-to-text (i2t) 与 text-to-image (t2i) 双向 R@1/5/10，以及 mAP、MedR。

## 三、数学形式

R@k = \frac{1}{|Q|}\sum_{q\in Q} \mathbb{1}[\mathrm{gt}_q \in \mathrm{TopK}_q]
其中 \mathrm{TopK}_q 为按相似度排前 k 的候选。平均秩 MedR 为所有查询真实项排名的中位数。

## 四、代码实现

```python
def recall_at_k(sim, labels, k=10):
    # sim: [Nq, Nc], labels[i,j]=1 表示配对
    hits = 0
    for i in range(sim.size(0)):
        top = sim[i].topk(k).indices
        if labels[i, top].any():
            hits += 1
    return hits / sim.size(0)
```

## 五、与其他对比

相比 precision@k，R@k 重视查全；相比 mAP，R@k 不惩罚排序细节；三者互补报告更全面。COCO 检索以 R@1/5/10 为主流。

## 六、常见误区

只看 R@1 忽略长尾；未区分 i2t/t2i；混淆检索指标与分类准确率；负样本量影响 R@k 绝对值。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：Recall@k 含义？答：前 k 含真相关的查询比例。
- Q：为何双向报告？答：图搜文与文搜图难度不同。
- Q：与 mAP 区别？答：mAP 考虑排序精度。

## 九、演进

从单一 R@k 到多指标联合；引入 zero-shot 检索基准；与生成式检索混合评测。

## 十、小结

Recall@k 是跨模态检索最直观的查全度量，需配合排序类指标形成完整评测视图。
