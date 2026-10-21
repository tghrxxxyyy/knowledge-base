# 状压 DP 与子集枚举

> 对应 Knuth《计算机程序设计艺术》卷 4A 组合枚举、Cormen et al.《算法导论》第 15 章，以及 Codeforces/AtCoder 社区关于 SOS DP（Sum over Subsets）的经典教程。

## 一、背景与挑战

状压 DP 把状态压成位掩码之后，真正的性能瓶颈往往不在"状态有多少"，而在**转移怎么写**。最常见的一类转移形如：`dp[mask]` 要由 `mask` 的某个子集 `sub` 合并而来——例如"把 mask 划分成若干组，每组各自产生收益，求总收益最大"，或"mask 里的元素按某种方式分批投放"。朴素写法是枚举 `mask` 再枚举其所有子集，若不加分析，很容易写出 $O(4^n)$ 的四重循环（外层 $2^n$ 个 mask、内层每个 mask 再枚举 $2^{popcount}$ 个子集的上界 $2^n$），在 $n=20$ 时直接超时。

为什么朴素做法不行？因为"枚举子集"的总工作量被系统性地重复计算了。正确的分析是：所有 mask 的子集枚举总次数恰为 $3^n$，而不是 $4^n$。不理解这个均摊，就无法在面试中给出可信的复杂度，也写不出正确的剪枝（比如只枚举非空真子集，或固定包含某一位，避免子集与其补集被算两次）。

在算法竞赛与面试里，子集枚举是"集合划分 DP / 分组状压 / 子集卷积"的通用引擎；在工程里，它出现在特征子集选择、权限组合校验、编译器指令覆盖等场景。面试官真正想听到的是三件事：`sub = (sub-1) & mask` 这个迭代器为什么正确、总复杂度为什么是 $3^n$、以及在"划分为两半"时如何用对称性砍掉一半常数。

## 二、核心原理

**子集迭代器。** 给定 `mask`，用

```text
sub = mask
while True:
    use(sub)
    if sub == 0:
        break
    sub = (sub - 1) & mask
```

即可按降序枚举 `mask` 的所有子集。原理：`sub - 1` 在整数意义下是"比 sub 小的最大整数"，其二进制相当于把 `sub` 的最低连续若干 1 变 0、下一位变 1；再与 `mask` 做 `&`，就把"跑到 mask 外面"的位全部清掉，得到的仍是 `mask` 的子集，且恰好是严格更小的下一个。直到 `sub == 0` 后再处理 0 并退出，正好枚举完 $2^{popcount(mask)}$ 个子集，不重不漏。

**为什么总和是 $3^n$。** 把每个元素相对 `mask` 的归属分成三态：在 `mask` 但不在 `sub`、在 `sub`、根本不在 `mask`。三态独立，故总枚举次数 $3^n$。换一个角度：$\sum_{mask \subseteq U} 2^{|mask|} = \sum_{k=0}^{n} \binom{n}{k} 2^k = (1+2)^n = 3^n$。这个推导必须能现场写出来。

**避免重复计算的两个技巧。** 一是**固定最低位**：若 `dp[mask]` 只关心"划分"而不关心顺序，则 `mask = A ∪ B` 与 `B ∪ A` 会重复。可强制 `lowbit(mask) \in A`（或强制 `A` 含 `mask` 的最低位），把对称划分砍掉一半。二是**只枚举真子集**：`sub` 从 `(mask-1) & mask` 开始，在 `sub == 0` 时停止（不处理 `sub == mask`），用于"必须切成两块"的转移。

**与 SOS DP 的关系。** 当转移不是"取 max/加一次"，而是要求对每个 `mask` 求 $\sum_{sub \subseteq mask} f[sub]$（子集和），逐个枚举仍是 $O(3^n)$；而 SOS DP 用 FWT 式的按位 DP，可以做到 $O(n\cdot 2^n)$：逐位把"该位在 mask 中为 1 时从去掉该位的状态继承"。这是同一问题的更优解，但常用于线性/加法聚合，不适用于 max/任意代价转移。

**不变量与边界。** 迭代过程中 `sub ⊆ mask` 始终成立；`sub == 0` 是合法子集，不要漏掉；若 `dp[0]` 有明确语义（空集代价为 0），初始化必须写对，否则所有划分都错。

## 三、形式化与数学基础

**子集枚举总复杂度定理。** 设 $U = \{0,1,\dots,n-1\}$，枚举所有 $mask \subseteq U$ 的所有 $sub \subseteq mask$，则访问次数

$$
\sum_{mask \subseteq U} 2^{|mask|} = \sum_{k=0}^{n} \binom{n}{k} 2^k = 3^n.
$$

**证明。** 由二项式定理 $(1+x)^n = \sum_k \binom{n}{k} x^k$，令 $x = 2$ 即得。组合解释：每个元素三选一（不在 mask / 在 mask 不在 sub / 在 sub），独立相乘。 $\square$

**划分型转移。** 例如把集合 $mask$ 分成两个非空部分 $A \sqcup B = mask$，代价 $g(A)+h(B)$：

$$
dp[mask] = \max_{\emptyset \neq A \subsetneq mask} \bigl( g(A) + h(mask \setminus A) \bigr).
$$

朴素枚举是 $O(3^n)$；固定 $lowbit(mask) \in A$ 后，每一对 $\{A,B\}$ 只被枚举一次，复杂度不变但常数减半。

**最优化划分（TSP 分组变体）示例。** 若 $g(A)$ 本身又是子集 DP 的结果（例如 $A$ 内部连通代价），则总体 $O(3^n)$，空间 $O(2^n)$。

**SOS DP 复杂度。** 求 $F[mask] = \sum_{sub \subseteq mask} f[sub]$ 时，按位递推：

$$
F^{(i)}[mask] = F^{(i-1)}[mask] + \mathbb{1}[bit_i(mask)=1] \cdot F^{(i-1)}[mask \oplus 2^i]
$$

共 $n$ 轮、每轮 $2^n$ 状态，故 $O(n 2^n)$。这比 $O(3^n)$ 在 $n$ 较大时有实质优势（$n=20$ 时 $2\times 10^7$ 对 $3.5\times 10^9$）。

**均摊 vs 最坏。** 单个 `mask` 的子集数是 $2^{popcount(mask)}$，最大 $2^n$；但对所有 mask 求和是 $3^n$。面试中若只说"最坏 $2^n \cdot 2^n$"，会被判定复杂度分析不过关。

## 四、代码实现

完整可运行代码：（1）子集枚举迭代器；（2）$O(3^n)$ 的集合划分 DP；（3）SOS DP 子集和。

```python
# 子集枚举 + 集合划分 DP + SOS DP


def popcount(x):
    return bin(x).count('1')


def submasks(mask, skip_self=False):
    """枚举 mask 的全部子集；skip_self=True 则不枚举 mask 自身。"""
    sub = (mask - 1) & mask if skip_self else mask
    while True:
        yield sub
        if sub == 0:
            break
        sub = (sub - 1) & mask


def partition_dp(n, gain):
    """
    把全集 U=(1<<n)-1 划分成若干非空组，每组价值 gain[S]，
    总价值为各组之和，求最大总价值。
    转移: dp[mask] = max_{sub ⊆ mask, sub≠∅} dp[mask ^ sub] + gain[sub]
    固定 lowbit(mask) ∈ sub，避免组顺序重复。
    时间 O(3^n)，空间 O(2^n)。
    """
    size = 1 << n
    dp = [float('-inf')] * size
    dp[0] = 0
    for mask in range(1, size):
        # 枚举含 lowbit(mask) 的子集 sub
        lb = mask & -mask
        rest = mask ^ lb
        sub = rest
        while True:
            s = sub | lb
            if dp[mask ^ s] > float('-inf'):
                val = dp[mask ^ s] + gain[s]
                if val > dp[mask]:
                    dp[mask] = val
            if sub == 0:
                break
            sub = (sub - 1) & rest
    return dp[size - 1]


def sos_sum(f):
    """F[mask] = sum_{sub ⊆ mask} f[sub]，O(n 2^n)。f 长度 2^n。"""
    n = (len(f) - 1).bit_length()
    F = f[:]
    for i in range(n):
        for mask in range(1 << n):
            if mask & (1 << i):
                F[mask] += F[mask ^ (1 << i)]
    return F


if __name__ == '__main__':
    # 用例 1：子集枚举完整性
    assert sorted(submasks(0b1011)) == [0, 1, 2, 3, 8, 9, 10, 11]

    # 用例 2：n=3，gain[S]=|S|^2，最优划分为三组单点：1+1+1=3？ 
    # 两组 {0,1},{2}：4+1=5；一组整体：9 —— 允许一组时最优 9
    n = 3
    size = 1 << n
    gain = [popcount(s) * popcount(s) for s in range(size)]
    print('partition max =', partition_dp(n, gain))  # 9

    # 用例 3：SOS 验证 f[sub]=1 ⇒ F[mask]=2^{|mask|}
    f = [1] * size
    F = sos_sum(f)
    assert all(F[m] == (1 << popcount(m)) for m in range(size))
    print('sos ok')
```

实现细节：`partition_dp` 中 `sub` 从 `rest` 开始，配合强制并入 `lb`，每个划分只被枚举一次；`sos_sum` 用原地滚动数组即可，第 $i$ 轮只影响 $bit_i=1$ 的状态。

## 五、与其他技术对比

| 方法 | 时间 | 空间 | 适用转移 | 备注 |
|------|------|------|----------|------|
| 朴素子集枚举 | $O(3^n)$ | $O(2^n)$ | max/任意代价 | 通用，最常用 |
| 固定 lowbit 对称去重 | $O(3^n)$，常数减半 | $O(2^n)$ | 划分型 | 无序划分必用 |
| SOS DP | $O(n 2^n)$ | $O(2^n)$ | 可加/线性聚合 | 子集和、子集卷积前置 |
| FWT / 子集卷积 | $O(n^2 2^n)$ | $O(2^n)$ | 卷积类 | 更高阶 |
| 折半枚举 | $O(2^{n/2})$ | $O(2^{n/2})$ | 两段拼接 | $n$ 到 40 |

取舍：转移是 max/min/任意代价时只能用 $O(3^n)$ 枚举；转移是求和且只要子集和时，立刻换 SOS；$n>25$ 时状压本身就不合适，应考虑折半或启发式。

## 六、常见误区

1. **把复杂度说成 $O(4^n)$。** 事实上 $\sum_{mask}2^{|mask|}=3^n$；说错会直接暴露没做过均摊分析。
2. **`sub` 迭代写成 `sub = (sub - 1) & mask` 却在 `sub==0` 时 break 得太早。** 结果是漏掉空集，导致"必须留出一组"类转移边界全错。正确做法是先 `yield/use(sub)`，再判断是否为 0。
3. **划分问题不固定 lowbit。** 两组划分 $\{A,B\}$ 与 $\{B,A\}$ 被各算一次，计数题直接翻倍，最值题常数翻倍且易在去重时写错。
4. **把 SOS DP 用于 max 聚合。** SOS 的逐位递推只对加法/线性成立，对 max 不满足可加性，结果错误。max 必须老实枚举子集。
5. **`sub` 被错误地写成 `sub = (sub - 1) & mask` 之前忘了 `sub = mask` 初值**，或用 `for sub in range(mask)`（这是数值小于 mask 的子集枚举，完全错误——子集与数值大小无关，例如 `0b1000` 的子集有 `0b0111` 吗？没有；但 `0b0111` 的子集 `0b0111` 数值小于 `0b1000` 却不是其子集）。

## 七、与开源书/权威来源对应

- Knuth, *The Art of Computer Programming*, Vol. 4A, §7.2.1.1 — 组合对象的枚举与二进制表示。
- 李煜东《算法竞赛进阶指南》第 3 章 — 子集枚举与状压 DP 例题。
- Codeforces Blog: "SOS Dynamic Programming"（经典 SOS DP 教程）。
- AtCoder Library Practice Contest — 子集卷积 / 高维前缀和相关题解。

## 八、面试题

**1. 请证明枚举所有子集的总复杂度是 $O(3^n)$，并写出自底向上枚举代码。**
参考答案：$\sum_{k=0}^n \binom{n}{k} 2^k = 3^n$（二项式定理，$x=2$）。代码 `sub = mask; while True: ...; sub = (sub-1) & mask`，在处理完 0 后退出。

**2. 给定 $n\le 20$，要把集合划分成两个非空部分使两部分代价和最大，如何避免重复？**
参考答案：强制 `lowbit(mask)` 属于其中一部分（例如 part A），枚举 A 的所有含 lowbit 的子集，B 取补。这样每个无序划分 $\{A,B\}$ 只出现一次，复杂度仍 $O(3^n)$ 但常数减半。

**3. 何时用 SOS DP 而不是子集枚举？**
参考答案：当转移是线性可加的（求子集和、子集卷积的降维）时，SOS 用 $O(n2^n)$ 显著优于 $O(3^n)$；若是 max/min 或带任意权重的划分代价，必须用枚举。

**4. 空集在子集枚举里要不要处理？**
参考答案：要。`sub = 0` 是合法子集，对应"一组都不选/剩余全空"的边界。漏掉它会导致 `dp[0]` 无法被用作递推起点，或某些必须留空的转移永远不可达。但若题目要求每组非空，则应在枚举时 `if sub == 0: continue`，两种语义要分清。

## 九、演进与趋势

子集枚举是更高级技巧的入口。**子集卷积**把两个集合函数的不交并卷积化为 $O(n^2 2^n)$ 的 SOS 体系；**子集格上的 Möbius 反演**在计数与容斥中把"恰好/至少"互换；**集合覆盖与背包状压**用同一迭代器做分组转移；**Meet-in-the-middle** 把 $n=40$ 拆成两个 $2^{20}$ 再拼接，是 $3^n$ 无法覆盖时的标准出路。工程上，特征子集搜索、硬件测试、规则引擎的条件组合校验都会用到同一套位集合枚举；GPU 位并行、BDD 决策图则是工业级加速。面试趋势上，能正确说出 $3^n$ 并会写 `sub = (sub-1)&mask`，已是集合 DP 的及格线；能再区分何时该用 SOS，则是加分线。

## 十、小结

子集枚举把"集合划分/子集转移"从 $O(4^n)$ 的错觉纠正为 $O(3^n)$ 的均摊现实，核心是 `sub = (sub-1) & mask` 迭代器与三态计数证明；配合 lowbit 对称去重可以砍半常数，而在可加聚合下应改用 SOS DP 达到 $O(n2^n)$。把这三种工具分清楚，集合型状压 DP 的转移设计就稳了。
