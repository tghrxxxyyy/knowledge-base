# LRU及其近似硬件实现

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》缓存章节。

## 一、背景与挑战
当缓存满且发生缺失时，需选出一行替换。理想 LRU（最近最少使用）在栈式工作集下近似最优，但真 LRU 在相联度较高时硬件代价昂贵（需维护全序）。

## 二、核心原理
真 LRU 为每组维护一个年龄矩阵或使用计数器全序排列。硬件常用树状伪 LRU（tree-PLRU）：以二叉树表示组内行，每位指示最近访问走向，访问某行时更新路径上的位。

## 三、形式化与数学基础
真 LRU 命中率随相联度 $A$ 提升趋于 Belady OPT。树状 PLRU 仅需 $A-1$ 位状态（而真 LRU 需 $O(A\log A)$）：
$$Bits_{PLRU} = A - 1,\quad Bits_{LRU} = A\lceil\log_2 A\rceil$$
对 8 路需 7 位 vs 24 位。

## 四、代码实现
```c
// 8路树状PLRU: 7位, 索引0..6
unsigned char tree = 0;
void touch(int way) { // way in [0,7]
    int node = 0;
    for (int lvl = 0; lvl < 3; lvl++) {
        int bit = (way >> (2-lvl)) & 1;
        if (bit) tree |= (1 << node); else tree &= ~(1 << node);
        node = (node << 1) + 1 + bit;
    }
}
int victim(void) {
    int node = 0;
    for (int lvl = 0; lvl < 3; lvl++)
        node = (node << 1) + 1 + ((tree >> node) & 1);
    return node & 7;
}
```

## 五、与其他技术对比
真 LRU 精度高但状态多；PLRU 状态少、抗扫描（scan）能力差（扫描 N 个不同块会污染全部历史）；FIFO 更简单但存在 Belady 异常。

## 六、常见误区
误以为 PLRU 等于真 LRU：PLRU 可能替换掉最近访问过的行。误以为大相联度无成本。

## 七、与开源书/权威来源对应
量化方法缓存与替换；CSAPP 第6章缓存实验（csim）要求实现 LRU。

## 八、面试题
问：8路缓存真 LRU 需要多少状态位？答：每路需 $\log_2 8=3$ 位序，共 24，或等价年龄矩阵。

## 九、演进与趋势
LRU 在扫描型负载下被自适应插入策略（DIP）取代，详见后续文档。

## 十、小结
LRU 是缓存替换基准，硬件以 PLRU 等近似在精度与状态量间折中。
