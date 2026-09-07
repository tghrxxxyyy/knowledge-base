# 状压 DP 与子集枚举

> 对应 youngyangyang04/leetcode-master 状态压缩（子集枚举）与 Bellman 1962 DP 原理。

## 一、背景与挑战
许多 DP 需要"枚举某状态的所有子状态"来转移（如集合划分、最短路过子集）。朴素枚举慢。

## 二、核心原理
用 `sub = (sub-1) & mask` 技巧枚举 mask 的所有子子集。对每个子状态计算贡献并合并到父状态。

## 三、形式化与数学基础
对状态 mask，其所有子子集 `sub` 满足 `sub & mask == sub`，共 $2^{|mask|}$ 个，可用上述递推在 $O(3^n)$ 内遍历全部（含所有 mask）。

## 四、代码实现
```python
def subset_dp(n):
    N = 1 << n
    dp = [0] * N
    dp[0] = 1
    for mask in range(1, N):
        sub = mask
        while sub:
            # 用子状态 sub 转移到 mask
            dp[mask] += dp[mask ^ sub]   # 示例：划分贡献
            sub = (sub - 1) & mask
    return dp[N - 1]

def enumerate_subsets(mask):
    sub = mask
    while True:
        yield sub
        if sub == 0:
            break
        sub = (sub - 1) & mask
```

## 五、与其他技术对比
逐元素选/不选是 $O(2^n)$ 单 mask 枚举；`sub=(sub-1)&mask` 直接枚举子子集，常数更优且易嵌 DP。

## 六、常见误区
- 枚举顺序导致重复计数（应明确"划分"语义）。
- 忘记先 yield 当前 sub 再递减。

## 七、与开源书/权威来源对应
- leetcode-master 状态压缩子集枚举。
- Bellman 1962 DP 子问题组合。

## 八、面试题
1. 如何枚举 mask 的所有子子集（高效）？
2. 子集 DP 总复杂度为何是 $O(3^n)$？

## 九、演进与趋势
子集卷积（子集 FFT）把子集 DP 加速到 $O(n^2 2^n)$，用于高级组合优化。

## 十、小结
`sub=(sub-1)&mask` 是状压 DP 中枚举子状态的标配技巧。
