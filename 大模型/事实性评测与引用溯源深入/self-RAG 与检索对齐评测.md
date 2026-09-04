# self-RAG 与检索对齐评测

> 对应 Asai 2023 self-RAG。

## 一、背景与挑战
并非所有问题都需检索，盲目检索引入噪声，需评测自适应决策质量。

## 二、核心原理
self-RAG 训练模型输出特殊标记以决定检索与引用，评测关注标记准确率与最终事实性。

## 三、形式化与数学基础
检索决策准确率：
$ R = \frac{1}{N}\sum_i \mathbb{1}[\text{retrieve?}_i = g_i] $

## 四、代码实现
```python
def retrieve_acc(pred_flags, gold_flags):
    return sum(p == g for p, g in zip(pred_flags, gold_flags)) / len(gold_flags)
```

## 五、与其他技术对比
相比固定 RAG，自适应更省检索且更准，但评测需标注决策标签。

## 六、常见误区
只评最终答案忽略决策正确性；把噪声检索当增益。

## 七、与开源书/权威来源对应
Asai 2023 提出 self-RAG 与其评测协议。

## 八、面试题
如何评测模型是否该检索？

## 九、演进与趋势
把决策标记作为可训练奖励信号。

## 十、小结
检索对齐评测关注是否、何时、用何检索。
