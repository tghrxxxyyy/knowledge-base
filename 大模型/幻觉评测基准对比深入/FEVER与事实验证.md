# FEVER与事实验证

> 对应 Thorne et al. 2018 "FEVER: A Large-scale Dataset for Fact Extraction and VERification"。

## 一、背景与挑战

事实验证需判定声明是否被维基支持。FEVER 提供蕴含/反驳/信息不足三态标注，是检索+推理验证的早期标杆。

## 二、核心原理

给定声明，先从维基检索证据句，再判 SUPPORTS/REFUTES/NOT EVERGIVEN。评测分检索精度与标签准确率两阶段。

## 三、数学形式

标签准确率：

$$
\mathrm{Acc}=\frac{1}{N}\sum\mathbf{1}[\hat{l}=l^*]
$$

证据召回：

$$
R=\frac{|\mathrm{retrieved}\cap\mathrm{gold}|}{|\mathrm{gold}|}
$$

## 四、代码实现

```python
def label_acc(preds, golds):
    return sum(p==g for p,g in zip(preds,golds))/len(preds)

print(round(label_acc(["s","r","s"],["s","r","n"]),3))
```

## 五、与其他对比

相比 TruthfulQA（生成），FEVER 是验证任务；相比 FactScore（长生成），FEVER 单声明。

## 六、常见误区

误区一：仅看标签忽略检索。误区二：三态当二态。误区三：把证据检索当已解决。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：FEVER 三态？答：SUPPORTS/REFUTES/NOT ENOUGH INFO。
- Q：为何分两阶段评？答：检索质量影响验证上限。

## 九、演进

FEVER 奠定检索增强验证范式，影响后续事实核查评测设计。

## 十、小结

FEVER 以检索+三态验证建立事实验证基准，是幻觉事实维度的根基之一。
