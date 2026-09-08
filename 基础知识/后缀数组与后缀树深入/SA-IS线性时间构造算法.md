# SA-IS线性时间构造算法

> 对应 Manber《Suffix Arrays》。

## 一、背景与挑战
倍增法 $O(n\log n)$ 在长文本（人类基因组约 $3\times10^9$ 字符）上偏慢。Nong、Zhang、Chan 于 2009 年提出的 SA-IS（Suffix Array by Induced Sorting）能在 $O(n)$ 时间内构造后缀数组，且常数小、工程友好。

## 二、核心原理
把后缀分为 L 型（小于其后缀）与 S 型（大于其后缀），特殊地「星号 S 型」(S*) 是前一个也是 S 型的 S 型。先递归地对「约一半数量的 S* 子串」构造 SA，再用诱导排序把其余后缀填入正确位置。诱导排序分三步：先放 LMS（S* 起点），再从左向右诱导 L 型，再从右向左诱导 S 型。

## 三、形式化与数学基础
设字符集大小 $\Sigma$，字符映射为整数 $s[i]\in[0,\Sigma]$。算法递归深度 $O(\log_\Sigma n)$，每层总工作量线性，故：
$T(n)=O(n)$。诱导排序的正确性依赖性质：若 $i$ 是 L 型且 $s[i-1]\le s[i]$，则 $i-1$ 必在 $i$ 之前。

## 四、代码实现
```python
def sa_is(s, upper):
    n = len(s)
    if n == 0:
        return []
    if n == 1:
        return [0]
    if n == 2:
        return [0, 1] if s[0] < s[1] else [1, 0]
    sa = [0] * n
    ls = [False] * n
    for i in range(n - 2, -1, -1):
        ls[i] = ls[i + 1] if s[i] == s[i + 1] else (s[i] < s[i + 1])
    def induced_sort(lms):
        nonlocal sa
        sa = [-1] * n
        buf = [0] * (upper + 2)
        for c in s:
            buf[c + 1] += 1
        for i in range(upper + 1):
            buf[i + 1] += buf[i]
        for d in reversed(lms):
            buf[s[d]] -= 1
            sa[buf[s[d]]] = d
        buf = [0] * (upper + 2)
        for c in s:
            buf[c + 1] += 1
        for i in range(upper + 1):
            buf[i + 1] += buf[i]
        for i in range(1, upper + 1):
            buf[i] += buf[i - 1]
        for i in range(n):
            v = sa[i]
            if v >= 1 and not ls[v - 1]:
                buf[s[v - 1]] += 1
                sa[buf[s[v - 1]]] = v - 1
        buf = [0] * (upper + 2)
        for c in s:
            buf[c + 1] += 1
        for i in range(upper + 1):
            buf[i + 1] += buf[i]
        for i in range(upper, -1, -1):
            buf[i] += buf[i + 1]
        for i in range(n - 1, -1, -1):
            v = sa[i]
            if v >= 1 and ls[v - 1]:
                buf[s[v - 1]] -= 1
                sa[buf[s[v - 1]]] = v - 1
    lms_map = [-1] * (n + 1)
    m = 0
    for i in range(1, n):
        if not ls[i - 1] and ls[i]:
            lms_map[i] = m
            m += 1
    lms = [i for i in range(1, n) if not ls[i - 1] and ls[i]]
    induced_sort(lms)
    if m:
        sorted_lms = [v for v in sa if lms_map[v] != -1]
        rec_s = [0] * m
        rec_upper = 0
        rec_s[lms_map[sorted_lms[0]]] = 0
        for i in range(1, m):
            l = sorted_lms[i - 1]
            r = sorted_lms[i]
            end_l = lms[lms_map[l] + 1] if lms_map[l] + 1 < m else n
            end_r = lms[lms_map[r] + 1] if lms_map[r] + 1 < m else n
            same = (end_l - l == end_r - r)
            if same:
                while l < end_l and s[l] == s[r]:
                    l += 1
                    r += 1
                if l == n or r == n or s[l] != s[r]:
                    same = False
            if not same:
                rec_upper += 1
            rec_s[lms_map[sorted_lms[i]]] = rec_upper
        rec_sa = sa_is(rec_s, rec_upper)
        for i in range(m):
            sorted_lms[i] = lms[rec_sa[i]]
        induced_sort(sorted_lms)
    return sa
```

## 五、与其他技术对比
相比倍增法，SA-IS 线性且常数小；相比 DC3/skew，SA-IS 不需要额外空间技巧、实际更快。其代价是实现细节多、易写错。

## 六、常见误区
误把 S 型与 L 型定义反了。正确判定：从串尾向前扫，句子结束符（最小字符）为 S 型；若 $s[i]<s[i+1]$ 为 S 型，若 $s[i]>s[i+1]$ 为 L 型，相等则继承 $i+1$ 的类型。

## 七、与开源书/权威来源对应
Nong 等 2009 原始论文；AtCoder Library 提供了工业级 `sa_is` 实现；Manber《Suffix Arrays》是后缀数组经典教材。

## 八、面试题
写 SA-IS 的诱导排序三步；或解释为什么递归子问题规模不超过 $n/2$。

## 九、演进与趋势
诱导排序思想催生了 `divsufsort`、`SA-IS` 的各种工程优化（如两遍扫描、位压缩），是当前最快的后缀数组构造算法族。

## 十、小结
SA-IS 以诱导排序 + 递归把后缀数组构造降到线性 $O(n)$，是处理超长文本的标准算法。
