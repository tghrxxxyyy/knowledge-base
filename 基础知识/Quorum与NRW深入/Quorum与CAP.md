# Quorum与CAP

> 对应 Gilbert & Lynch 2002（CAP 定理证明）与 Brewer 2000（CAP 猜想）以及 Gifford 1979（quorum 起源）。

## 一、背景与挑战
Quorum 看似能“既要一致又要可用”，但 CAP 指出分区下二者不可兼得。理解 quorum 在 CAP 中的定位，避免误用。

## 二、核心原理
- 无分区时，quorum 可同时达成 C 与 A。
- 发生分区时，若坚持 W+R>N 则少数派无法读写，牺牲 A 保 C（CP）。
- 若放宽使两侧都能写，则保 A 但产生分歧（AP），需事后合并。

## 三、形式化与数学基础
设分区将副本分两半大小 a、b（a+b=N）。若 W > b 且 R > b，则大小为 b 的一侧既写不成也读不到最新，故为 CP。反之两侧皆可写为 AP。即 quorum 参数决定 CAP 取舍点。

## 四、代码实现
# 分区下是否可写
def writable(side_size, N, W):
    return side_size >= W   # 仅满足 W 的一侧可写 => CP

## 五、与其他技术对比
- 对比 2PC：2PC 强一致但分区下整体不可用。
- 对比 Gossip：gossip 是 AP，无 quorum 相交保证。

## 六、常见误区
1. 以为 quorum 能绕过 CAP。
2. 把“多数派可读写”当成全局线性一致。

## 七、与开源书/权威来源对应
- Gilbert & Lynch 2002。
- Brewer 2000。
- Gifford 1979。

## 八、面试题
1. quorum 是否违反 CAP？
2. 分区下 quorum 如何表现为 CP 或 AP？

## 九、演进与趋势
可调一致性在请求级暴露 CAP 取舍，让应用自行选择。

## 十、小结
Quorum 不突破 CAP，而是把分区下的 C/A 取舍参数化到 (R,W)。
