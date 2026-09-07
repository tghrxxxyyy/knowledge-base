# Quorum与一致性级别

> 对应 Kleppmann DDIA 第5章（replication & consistency models）与 Gilbert & Lynch 2002（CAP）。

## 一、背景与挑战
不同业务对一致性要求不同：金融需要强一致，feed 流可接受最终一致。Quorum 的 (R,W) 选择直接映射这些级别。

## 二、核心原理
- 强一致：W+R>N，读必见最新写（线性/顺序一致视图）。
- 弱一致：W+R<=N，可能读到旧值。
- 读写各自可调，例如 W=N 保证写全副本，R=1 低延迟读旧值。

## 三、形式化与数学基础
设读延迟 $L_R \propto R$，写延迟 $L_W \propto W$。可用度近似：
$A \approx 1 - P(\text{存活副本} < \min(W,R))$
故降低 W/R 提升可用但削弱一致保证。

## 四、代码实现
# 一致性级别到参数
def pick(N, level):
    if level == "strong":
        w = N // 2 + 1
        return w, N - w + 1
    return 1, 1

## 五、与其他技术对比
- 对比线性一致存储：quorum 仅保证“读到最新”，未必线性。
- 对比因果一致：quorum 不保证跨 key 因果。

## 六、常见误区
1. 以为 quorum 读就是线性一致——还需全局序。
2. 盲目追求 W=N 导致写不可用。

## 七、与开源书/权威来源对应
- Kleppmann, DDIA, Ch.5。
- Gilbert & Lynch 2002。
- Vonng/ddia。

## 八、面试题
1. quorum 能保证线性一致吗？
2. 如何为不同业务选 R/W？

## 九、演进与趋势
客户端一致性（如 Cassandra 的 ONE/QUORUM/ALL）暴露给调用方。

## 十、小结
Quorum 是一致性级别的可调底座，配合一致性模型才算完整。
