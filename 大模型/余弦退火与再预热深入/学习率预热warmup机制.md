# 学习率预热warmup机制

> 对应 d2l-ai/d2l-zh 与 karpathy/nanoGPT 的 warmup 实现。

## 一、背景与挑战
大模型训练初期，随机初始化的 LayerNorm/RMSNorm 与注意力尚未稳定，直接用大 lr 易让梯度爆炸、训练崩塌。

## 二、核心原理
warmup 在前若干步把 lr 从近 0 线性升到目标值，给优化器与二阶矩估计热身，避免早期大步破坏参数。

## 三、形式化与数学基础
线性预热：`η_t = η_max · t / T_warm`，t ≤ T_warm。之后接余弦退火。总 lr 曲线为先升后降。

## 四、代码实现
```python
def lr_with_warmup(t, T_warm, T_total, lr_max, lr_min):
    if t < T_warm:
        return lr_max * t / T_warm
    # 余弦阶段
    p = (t - T_warm) / (T_total - T_warm)
    return lr_min + 0.5 * (lr_max - lr_min) * (1 + math.cos(math.pi * p))
```

## 五、与其他技术对比
无 warmup 时大模型首步损失可能 NaN；恒定小 lr 则前期收敛过慢。warmup 平衡了稳定与效率。

## 六、常见误区
warmup 步数过短（如仅百步）对超大模型仍不足；过长则浪费前期学习容量。

## 七、与开源书/权威来源对应
d2l-ai/d2l-zh 讨论 warmup 必要性；huggingface/transformers 提供 `get_linear_schedule_with_warmup`。

## 八、面试题
问：warmup 主要防什么？答：防初期大 lr 引发的梯度不稳定与发散。

## 九、演进与趋势
恒定 warmup 之外，还出现线性-余弦、带重启等变体。

## 十、小结
warmup 是大模型训练不可或缺的稳定器，与余弦退火互补。
