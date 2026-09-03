# 投机解码与EAGLE对比

> 对应 Li et al., *EAGLE: Speculative Sampling with Feature-Level Autoregression*, 2024。

## 一、背景与挑战

普通草稿用独立小模型，与 target 特征脱钩、接受率受限；EAGLE 在特征级自回归提接受率。

## 二、核心原理

EAGLE 以 target 的隐状态为条件训练轻量自回归头，预测下一 token 的特征再映射词，草稿与 target 更一致，接受率更高；验证仍并行无损。

## 三、数学形式

草稿分布 $q_\phi(\cdot|h_{target})$ 逼近 $p$；接受长度 $\tau_{EAGLE}>\tau_{indep}$ 通常成立。

## 四、代码实现

```python
feat = target.hidden(x)
draft_tok = eagle_head(feat)   # 特征级自回归
```

## 五、与其他对比

- 与 投机解码总览：EAGLE 改进草稿来源，验证机制一致。
- 与 张量核心与混合精度推理深入：特征头小、成本低。

## 六、常见误区

- 以为 EAGLE 不需 target（仍需并行验证）。
- 忽视训练 EAGLE 头的额外成本。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- EAGLE 优势？答：用 target 特征训草稿头，与 target 更一致，接受率更高。

## 九、演进

独立小模型 → 特征级草稿 → 树/递归投机。

## 十、小结

EAGLE 以特征级草稿提升接受率，是投机解码主流增强。
