# N 皇后问题

> 对应 youngyangyang04/leetcode-master 回溯章节（N 皇后）与 Skiena《The Algorithm Design Manual》例题。

## 一、背景与挑战
在 $N\times N$ 棋盘放 $N$ 个皇后使其互不攻击（同行/列/对角线）。暴力 $N!$ 不可行，需回溯+强剪枝。

## 二、核心原理
逐行放皇后，每行尝试每列；用三个布尔集合记录列、主对角线、副对角线占用。冲突即剪枝。

## 三、形式化与数学基础
主对角线编号 $r-c$ 恒定，副对角线 $r+c$ 恒定。约束：对放置 $(r,c)$，需 $col[c]=false,\ diag1[r-c]=false,\ diag2[r+c]=false$。

## 四、代码实现
```python
def solve_n_queens(n):
    cols = [False] * n
    d1 = [False] * (2 * n)
    d2 = [False] * (2 * n)
    ans = []

    def dfs(r, path):
        if r == n:
            ans.append(list(path))
            return
        for c in range(n):
            if cols[c] or d1[r - c + n] or d2[r + c]:
                continue
            cols[c] = d1[r - c + n] = d2[r + c] = True
            path.append(c)
            dfs(r + 1, path)
            path.pop()
            cols[c] = d1[r - c + n] = d2[r + c] = False

    dfs(0, [])
    return ans
```

## 五、与其他技术对比
位运算可把三个集合压成整数，用 `bit & -bit` 取最低位，进一步加速（见位运算专题）。

## 六、常见误区
- 对角线编号未偏移导致数组越界（用 $r-c+n$ 偏移）。
- 忘记恢复布尔标记，状态污染。

## 七、与开源书/权威来源对应
- leetcode-master 给出 N 皇后标准回溯解法。
- Skiena 将其作为回溯经典案例。

## 八、面试题
1. 为什么主对角线用 $r-c$ 标识、副对角线用 $r+c$？
2. 能否用位运算将 N 皇后加速到 $O(N!)$ 常数更小？

## 九、演进与趋势
N 皇后解的存在性与计数（OEIS A000170）是组合数学经典问题，大额 $N$ 用分布式搜索。

## 十、小结
N 皇后是回溯+可行性剪枝的范本，关键是用集合 O(1) 判断冲突。
