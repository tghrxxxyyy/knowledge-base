# 列表wise 与 pointwise 重排损失

> 对应 Devlin et al. 2018《BERT》与 huggingface/transformers 排序训练范式。

## 一、背景与挑战
重排模型训练目标决定其排序行为。pointwise 独立打分、pairwise 比较两两、listwise 直接优化整列序，三者偏好不同。

## 二、核心原理
pointwise 把相关性当回归/分类；pairwise 最大化正例高于负例；listwise（如 ListNet、LambdaRank）直接优化如 NDCG 的可微代理。重排任务通常用 pairwise/listwise 更贴合排序指标。

## 三、形式化与数学基础
ListNet 用softmax 分布匹配：
$P(d_i \mid q) = \frac{\exp(s(q,d_i))}{\sum_j \exp(s(q,d_j))}$
损失为预测分布与真实相关性分布的 KL 散度；pairwise hinge 见交叉编码器章。

## 四、代码实现
```python
import torch, torch.nn as nn
def listnet_loss(scores, rel):
    p = torch.softmax(scores, 0)
    q = torch.softmax(rel.float(), 0)
    return nn.KLDivLoss()(p.log(), q)
```

## 五、与其他技术对比
pointwise 实现简单但忽略序信息；pairwise 易受难负例影响；listwise 最贴合 NDCG 但训练更不稳。实践中常混合使用。

## 六、常见误区
误区一：pointwise 准确率高为好，排序任务应看 NDCG 而非分类准确率。误区二：listwise 一定优于 pairwise，小数据下未必。

## 七、与开源书/权威来源对应
- Devlin et al. 2018 提供编码器 backbone。
- huggingface/transformers 支持序列分类式排序头。
- EleutherAI/lm-evaluation-harness 提供排序评测思路。

## 八、面试题
1. 三种损失各自的优化目标差异？
2. 为何排序任务慎用 pointwise 交叉熵？
3. ListNet 的 softmax 分布有何直观含义？

## 九、演进与趋势
用 LLM 生成偏好对后经 DPO 训练重排器，把 listwise 偏好直接注入交叉编码器。

## 十、小结
选择损失函数需匹配最终排序指标，listwise 最接近业务目标但需稳定训练。
