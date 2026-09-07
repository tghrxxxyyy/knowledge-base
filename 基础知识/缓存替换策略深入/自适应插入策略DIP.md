# 自适应插入策略 DIP

> 对应 Qureshi 等 2007 年 ISCA 论文《Adaptive Insertion Policies for High Performance Caching》（真实作者年份）。

## 一、背景与挑战
LRU 对"扫描型"与"重抖动型"负载表现差：一次性块污染缓存，挤走高频热块。如何让替换策略感知工作集特征？

## 二、核心原理
DIP（Dynamic Insertion Policy）维护一个"跟随集"（set dueling）：部分集合用传统 LRU，部分用 BIP（保留插入：新块插入为 LRU 候选而非 MRU，以快速淘汰扫描块）。用选择器统计哪类集合缺失更少，动态调整全网插入倾向。

## 三、形式化与数学基础
BIP 插入时以概率 $p$ 把新块放 MRU 端，否则放 LRU 端（即下次即被替）。设跟随集命中计数 $H_{LRU}, H_{BIP}$，选择器：
$$sel = \begin{cases} LRU & H_{LRU} > H_{BIP} \\ BIP & \text{否则} \end{cases}$$
饱和计数器防抖动。

## 四、代码实现
```c
// 简化的插入策略选择
unsigned char sel_ctr = 32; // 0..63, 偏LRU
void on_miss(int policy) {
    if (policy == LRU) { if (sel_ctr < 63) sel_ctr++; }
    else               { if (sel_ctr > 0)  sel_ctr--; }
}
int insert_mru(void) {
    // sel_ctr高用LRU插入(放MRU), 低用BIP(放LRU)
    return (sel_ctr >= 32) ? MRU : LRU_POS;
}
```

## 五、与其他技术对比
相比固定 LRU/PLRU，DIP 自适应，对混合负载更稳。比 Belady 可在线实现，仅需少量跟随集。

## 六、常见误区
误以为 DIP 完全不用 LRU：它保留 LRU 作为候选。误以为跟随集需大：几十个集合即可。

## 七、与开源书/权威来源对应
Qureshi et al. 2007 ISCA；后续衍生 Thread-Aware/DynThrottle。

## 八、面试题
问：set dueling 作用？答：低开销在线比较两种策略，驱动选择器。

## 九、演进与趋势
演进为基音感知（Signature-based）Hawkeye、以及结合机器学习预测死缓存块（MLP-aware）。

## 十、小结
DIP 用极小的跟随集实现了"依据负载自适应插入"，是现代缓存替换的范式转变。
