# ALiBi与其他相对位置

> 对应 Shaw et al., 2018 (relative position); T5 relative bias。

## 一、背景与挑战
相对位置编码有多种实现（相对位置向量、T5 桶化、ALiBi）。理解差异有助于设计。

## 二、核心原理
- Shaw 2018：可学习的相对位置向量 $a_{ij}$ 加到注意力分数。
- T5：把 $|i-j|$ 桶化为若干区间，每个区间一个可学习偏置。
- ALiBi：固定线性偏置 $-m|i-j|$，无参数。

## 三、形式化与数学基础
$ \text{score}_{ij}^{\text{rel}} = q_i^\top k_j + r_{ij} $，$r_{ij}$ 的实现因方法而异。T5 桶化 $r_{b(|i-j|)}$，ALiBi $r_{ij} = -m|i-j|$。

## 四、代码实现
```python
# T5 桶化偏置
def t5_bias(buckets, num_heads):
    bias = nn.Embedding(buckets, num_heads)
    # 训练时把距离映射到桶索引
```

## 五、与其他技术对比
- ALiBi：无参数、外推好、表达力弱。
- T5 桶化：可学习、外推有限、表达力强。
- Shaw 2018：可学习、参数多、需截断距离。

## 六、常见误区
- 把 ALiBi 当作可学习（它固定）。
- 桶数过多致参数爆炸。

## 七、与开源书/权威来源对应
- google-research/text-to-text-transfer-transformer。
- huggingface/transformers T5 实现。

## 八、面试题
- 为什么 ALiBi 选固定而非可学习？答：可学习位置会过拟合训练长度分布。

## 九、演进与趋势
相对位置向量 → 桶化 → ALiBi → RoPE+ALiBi 混合。

## 十、小结
相对位置编码有多种实现，ALiBi 以极简设计换取外推能力。
