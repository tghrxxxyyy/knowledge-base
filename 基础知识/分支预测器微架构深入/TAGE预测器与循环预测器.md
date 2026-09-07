# TAGE预测器与循环预测器

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》及厂商手册中的现代预测器描述。

## 一、背景与挑战
两电平与 gshare 对"长历史模式"覆盖差：模式表被稀疏激活。TAGE（TAgged GEometric）通过几何长度递增的多分量，用有限状态捕捉极长历史相关。

## 二、核心原理
TAGE 由多个分量组成，第 $i$ 个分量历史长度 $L_i$ 按几何级数增长（如 4,8,16,32,...）。每个表项带一个标签（tag）。预测时从最长历史分量向下找第一个标签匹配的表项；若均不匹配则回退到基预测器（如 bimodal）。新分支在最短分量分配，逐步"提拔"到更长分量。

## 三、形式化与数学基础
设分量数 $M$，第 $i$ 分量历史长 $L_i = \lfloor \alpha^i \rfloor$。表项数为 $2^{l_i}$（地址位），标签位 $t_i$ 较长分量更宽以降低别名。预测为：
$$Pred = \arg\max_{i: tag_i == f(L_i, PC)} weight_i$$
提拔当短分量连续正确、长分量空时触发。

## 四、代码实现
```c
// 简化的TAGE分量查找
#define NC 6
struct tage_c { int len; unsigned char *tab; unsigned mask; } comp[NC];

int tage_predict(unsigned pc, unsigned long gh) {
    for (int i = NC-1; i >= 0; i--) {
        unsigned idx = (gh >> (comp[i].len/2)) & comp[i].mask;
        if (comp[i].tab[idx] & 0x80) // 标签匹配位
            return (comp[i].tab[idx] & 0x40) ? 1 : 0;
    }
    return base_predict(pc);
}
```

## 五、与其他技术对比
相比单一 gshare，TAGE 用分量几何覆盖从短到超长历史，误预测率显著下降（Championship Branch Prediction 赛事数据）。代价是标签比较与更新逻辑的硬件复杂度。

## 六、常见误区
误以为 TAGE 仅用更长历史：关键在"标签匹配 + 分量提拔"机制。误把 bimodal 当主预测器：它只是兜底基预测器。

## 七、与开源书/权威来源对应
量化方法与 CBP 研讨会论文描述 TAGE/ITTAGE；Intel/AMD 手册提及分支预测单元含循环预测器。

## 八、面试题
问：TAGE 如何用有限存储覆盖超长历史？答：几何长度分量 + 标签，仅活跃模式占存储。问：提拔（allocation）策略为何重要？

## 九、演进与趋势
ITTAGE 增加间接目标预测，感知机/神经网络预测器进一步降低难预测分支的误测。

## 十、小结
TAGE 以"几何分量 + 标签"优雅解决了长历史稀疏性问题，是当代高性能 CPU 的主流选择。
