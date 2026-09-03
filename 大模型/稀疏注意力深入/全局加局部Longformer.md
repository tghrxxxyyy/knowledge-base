# 全局加局部：Longformer

> 对应 Beltagy et al., *Longformer: The Long-Document Transformer*, 2020。

## 一、背景与挑战

纯局部窗口丢不掉文档级全局结构（如 CLS、问题、段落首），长文档任务需要全局锚点。

## 二、核心原理

Longformer 组合：滑动窗口注意力（每 token 看邻域）+ 扩张窗口（dilated，跳步看更远）+ 少量全局 token（对整个序列做全注意力），兼顾局部与全局，复杂度 $O(n)$。

## 三、数学形式

对全局 token $g$：$o_g=\sum_j \alpha_{gj}v_j$（全连接）；对其他 token：窗口+扩张边集 $E_{w,d}$；整体 $O(n)$。

## 四、代码实现

```python
attn = window_attn(q, k, w)            # 局部
attn = attn + dilated_attn(q, k, d)    # 扩张
attn[global_idx] = full_attn(q[global_idx], k)   # 全局
```

## 五、与其他对比

- 与 无限上下文深入（流式/全局 token）理念相通。
- 与 BigBird（下节）相比，全局策略更直白。

## 六、常见误区

- 全局 token 太多会回到 $O(n^2)$ 附近。
- 扩张步长固定可能错过关键距离。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Longformer 如何兼顾局部与全局？答：滑动+扩张窗口覆盖局部，少量全局 token 做全序列锚点。

## 九、演进

纯窗口 → 窗口+全局(Longformer) → 复杂稀疏组合。

## 十、小结

Longformer 用“局部为主、全局锚点”实现线性长文档建模，是稀疏注意力的经典范式。
