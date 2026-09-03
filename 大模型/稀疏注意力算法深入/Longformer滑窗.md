# Longformer滑窗注意力

> 对应 Beltagy et al., *Longformer: The Long-Document Transformer*, 2020。

## 一、背景与挑战

处理数千 token 文档时全注意力爆炸；需局部感知同时保留少量全局锚点。

## 二、核心原理

每个 token 只注意滑窗内 $w$ 个邻居（局部），并对少量预选全局 token（如 [CLS]）做全注意力，兼顾局部与全局。

## 三、数学形式

$A_{ij}$ 非零当 $|i-j|<w/2$ 或 $i,j\in G$（$G$ 全局集合）；复杂度约 $O(n\cdot w+|G|\cdot n)$。

## 四、代码实现

```python
def sliding_mask(L, w):
    m = torch.zeros(L, L)
    for i in range(L):
        m[i, max(0,i-w//2):i+w//2+1] = 1
    return m
```

## 五、与其他对比

- 比纯窗口多了全局 token，能传播跨段信息。
- 与 BigBird 相比无随机/空洞分量，模式更简单。

## 六、常见误区

- 全局 token 选错（如全选）反而退化为全注意力。
- 窗口 $w$ 过小致长程信息无法在多层间传播足够远。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Longformer 如何兼顾局部与全局？答：滑窗做局部注意，少量全局 token 做全注意桥接长程。

## 九、演进

滑窗 → 滑窗+全局 → 成为长文档编码器标准稀疏模式。

## 十、小结

Longformer 以滑窗+全局 token 在低成本下支持千级长度文档。
