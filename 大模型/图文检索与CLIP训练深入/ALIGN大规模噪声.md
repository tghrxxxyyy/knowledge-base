# ALIGN大规模噪声监督

> 对应 Jia et al., *Scaling Up Visual and Vision-Language Representation Learning With Noisy Text Supervision*, ICLR 2021。

## 一、背景与挑战

CLIP 用相对干净的图文对；ALIGN 探索更脏、更廉价的网络替代文本（alt-text），验证“噪声+规模”能否超越精筛。

## 二、核心原理

ALIGN 用海量（十亿级）噪声图文对，仅做轻量过滤（去重、去毒、分辨率），以对比训练，证明数据规模可压过标签噪声，并在检索/零样本上追平 CLIP。

## 三、数学形式

与 CLIP 同构的对比目标：

$$\mathcal L = -\log\frac{e^{s(v,t^+)/\tau}}{\sum_{k=1}^K e^{s(v,t_k)/\tau}}$$

区别仅在数据分布 $D$ 为噪声主导。

## 四、代码实现

```python
# 轻量过滤即可，不过度精标
pairs = remove_toxic(dedup(alt_text_pairs))
train_contrastive(image_enc, text_enc, pairs, epochs=1)
```

## 五、与其他对比

- 与 CLIP架构与训练 同源异数据策略。
- 与 大规模数据工程 共享“规模补偿噪声”结论。

## 六、常见误区

- 误以为必须精标；ALIGN 反例说明噪声可由规模抵消部分。
- 忽视去毒/去重的基本卫生。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- ALIGN 核心结论？答：在轻过滤下，极大规模噪声图文对可训练出媲美精标数据的强模型。

## 九、演进

精标 → 噪声+规模 → 课程清洗。

## 十、小结

ALIGN 证明数据规模可显著补偿噪声，是“大数据弱监督”的范例。
