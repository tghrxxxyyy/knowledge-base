# SECDED单错纠正双错检测

> 对应 Tanenbaum《Computer Organization and Design》与 Intel SDM 卷3。

## 一、背景与挑战
服务器内存要求高可靠性。单比特翻转需自动纠正，双比特翻转至少应被检测以避免静默数据损坏（silent data corruption）。

## 二、核心原理
在 (n, k) 海明码基础上增加一个全局奇偶校验位，构成 SECDED（Single Error Correction, Double Error Detection）。单错可由海明 syndrome 定位并翻转；双错时 syndrome 非 0 但全局奇偶不符，判定为不可纠双错并触发机器检查异常。

## 三、形式化与数学基础
设海明部分 syndrome 为 H，全局奇偶位 P。判定：

    H == 0, P == 0  -> 无错
    H != 0, P == 1  -> 单错, 位置 = H
    H != 0, 或(H==0, P==1) 的变体 -> 双错, 报告

（具体以 P 校验覆盖全部位为准）

## 四、代码实现
```c
/* 概念: 读内存后 ECC 校验 */
int ecc_check(uint64_t data, uint8_t synd, uint8_t overall_parity) {
    if (synd == 0 && overall_parity == 0) return 0; /* OK */
    if (synd != 0 && overall_parity != 0) return 1;  /* 单错可纠 */
    return 2; /* 双错, 不可纠 */
}
```

## 五、与其他技术对比
纯奇偶只能检错；纯海明只能纠单错且会误纠双错为「另一单位置」；SECDED 新增一位解决双错检测。

## 六、常见误区
误以为 SECDED 能纠正双错；它只能检测双错。误以为多比特突发错误总能检测，实际取决于错误图样。

## 七、与开源书/权威来源对应
Intel SDM 卷3 描述机器检查架构（MCA）如何上报不可纠正 ECC 错误。

## 八、面试题
1. SECDED 中多一位的作用？答：区分单错与双错。
2. 双错为何不能纠正？

## 九、演进与趋势
内存密度上升使 Rowhammer 与多比特错误更受关注，chipkill、RAID 式内存保护增强。

## 十、小结
SECDED 用单额外奇偶位在纠单错同时检测双错，是服务器内存可靠性的核心机制。
