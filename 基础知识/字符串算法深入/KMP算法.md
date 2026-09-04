# KMP算法

> 对应 Knuth-Morris-Pratt 1977 原始论文与 CLRS Ch.32。

## 一、背景与挑战
在文本 T 中匹配模式 P，暴力 O(nm) 低效。KMP 利用已匹配信息避免主串指针回退，达到 O(n+m)。

## 二、核心原理
预计算前缀函数 π：π[i] 为 P[0..i] 最长且相等的真前缀与真后缀长度；匹配失败时按 π 回退模式指针。

## 三、形式化 / 数学基础
$pi[0]=0$，对 $i>0$：
$pi[i] = \max\{k< i : P[0..k-1] = P[i-k+1..i]\}$
匹配转移：失配时 `j = pi[j-1]`。

## 四、代码实现
```python
def kmp(text, pat):
    n, m = len(text), len(pat)
    if m == 0:
        return 0
    pi = [0] * m
    for i in range(1, m):
        j = pi[i-1]
        while j > 0 and pat[i] != pat[j]:
            j = pi[j-1]
        if pat[i] == pat[j]:
            j += 1
        pi[i] = j
    j = 0
    for i in range(n):
        while j > 0 and text[i] != pat[j]:
            j = pi[j-1]
        if text[i] == pat[j]:
            j += 1
        if j == m:
            return i - m + 1
    return -1
```

## 五、与其他技术对比
与 Sunday/BM 相比，KMP 失配只回退模式；BM 利用坏字符/好后缀在实际文本中常更快。

## 六、常见误区
π 数组语义混淆（长度 vs 下标）；匹配时主串指针回退（应只移动模式）；边界 j=0 处理。

## 七、与开源书 / 权威来源对应
- Knuth, Morris, Pratt 1977
- CS-Notes: https://github.com/CyC2018/CS-Notes
- 代码随想录: https://github.com/youngyangyang04/leetcode-master

## 八、面试题
「实现 strStr」；「最短回文串」可用 KMP 求最长前缀回文。

## 九、演进与趋势
前缀函数与 Z 函数互相转化；在自动机/字符串哈希结合中作为经典预处理。

## 十、小结
KMP 用前缀函数消除主串回退，关键在 π 的正确递推与失配回跳。
