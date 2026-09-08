# 条件分支预测与TAGE预测器

> 对应 André Seznec 的 TAGE 预测器论文与 Hennessy & Patterson 第3章。

## 一、背景与挑战
简单局部分支历史难以捕捉长程、上下文相关模式（如偶发循环嵌套）。TAGE（TAgged GEometric history length）通过多个不同长度的历史组件提升覆盖率。

## 二、核心原理
TAGE 维护一组「组件」，每个组件用不同长度的全局历史计算索引，并带标签（tag）验证。预测时选择最长历史且标签匹配的组件作为权威预测，其余作备选。未命中则使用基础预测器（如 bimodal）。

## 三、形式化与数学基础
设历史长度集合 $L=\{l_1<l_2<\dots<l_n\}$，几何递增 $l_i\approx \alpha\cdot l_{i-1}$。组件 $i$ 的索引：
$$idx_i = (pc \oplus GHR[l_i:0])\bmod |T_i|$$
预测取满足 $tag_i$ 匹配的最大 $i$。

## 四、代码实现
```c
// TAGE 选择最长匹配组件示意
int predict(uint64_t pc, uint64_t ghr){
    for (int i = N-1; i >= 0; i--){
        int idx = (pc ^ (ghr & mask(i))) & (SIZES[i]-1);
        if (tage[i][idx].tag == compute_tag(pc,i))
            return tage[i][idx].ctr >> 1; // 用计数器高位预测
    }
    return base[pc & BASE_MASK] >> 1;
}
```

## 五、与其他技术对比
相比两位计数器或单一 GShare，TAGE 用多长度历史覆盖短程与长程模式，误预测率显著更低，代价是面积与功耗。

## 六、常见误区
误以为历史越长越好。过长的历史会稀释条目、增加别名，TAGE 的几何分布正是为平衡覆盖与别名。

## 七、与开源书/权威来源对应
Seznec 的 TAGE 系列论文是现代高性能分支预测器的事实标准；Hennessy & Patterson 概述了全局历史与局部分支历史思想。

## 八、面试题
问：TAGE 为何用标签？答：不同历史长度可能索引到同一位置，标签用于确认该条目确实由当前分支写入，避免别名误用。

## 九、演进与趋势
TAGE-SC-L、ITEAGE 等变种加入统计校正与循环预测器，进一步逼近 SPEC 误预测下限。

## 十、小结
TAGE 通过「多长度历史 + 标签验证 + 最长优先」把条件分支预测精度推到极高水平，是现代 CPU 标配。
