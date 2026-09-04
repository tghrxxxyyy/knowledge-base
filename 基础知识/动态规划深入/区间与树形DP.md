# 区间与树形DP

> 对应 《算法导论》矩阵链乘法与树形依赖问题。

## 一、背景与挑战
区间 DP 用于「合并相邻区间」类问题（矩阵链、石子合并）；树形 DP 在树上做子树合并（树的直径、子树选点限制）。

## 二、核心原理
区间 DP 枚举断点 k：`f[i][j] = min(f[i][k] + f[k+1][j] + cost)`，按长度递增；树形 DP 用 DFS 后序合并子树答案。

## 三、形式化 / 数学基础
矩阵链乘法：
$m[i][j] = \min_{i\le k<j}\big(m[i][k] + m[k+1][j] + p_{i-1}p_k p_j\big)$
树形选点（无相邻）：
$dp[u][0] = \sum_v dp[v][1],\quad dp[u][1] = val_u + \sum_v dp[v][0]$

## 四、代码实现
```python
def matrix_chain(p):
    n = len(p) - 1
    m = [[0] * (n + 1) for _ in range(n + 1)]
    for L in range(2, n + 1):
        for i in range(1, n - L + 2):
            j = i + L - 1
            m[i][j] = min(m[i][k] + m[k+1][j] + p[i-1]*p[k]*p[j] for k in range(i, j))
    return m[1][n]
```

## 五、与其他技术对比
区间 DP 与分治相似但子区间重叠需缓存；树形 DP 与树上贪心不同，需考虑子树间约束。

## 六、常见误区
断点枚举漏掉 k=j（实际 k<j）；树形 DP 后序顺序错导致父节点用到未算子树；维度开错。

## 七、与开源书 / 权威来源对应
- CLRS《Introduction to Algorithms》Ch.15.2 矩阵链乘法
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
「石子合并」区间 DP；「二叉树中的最大路径和」树形 DP。

## 九、演进与趋势
树上二次扫描与换根（在 O(n) 内求每个点为根的答案）；虚树压缩优化。

## 十、小结
区间 DP 关键是「长度递增 + 枚举断点」；树形 DP 关键是「后序合并子树并处理好根的选择约束」。
