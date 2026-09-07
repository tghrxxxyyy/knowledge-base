# Brian Kernighan 算法与位计数

> 对应 Brian Kernighan & Ritchie《The C Programming Language》技巧与 youngyangyang04/leetcode-master 位运算。

## 一、背景与挑战
统计整数二进制中 1 的个数（popcount）广泛用于位集、奇偶校验。朴素逐位扫描 $O(\text{bits})$。

## 二、核心原理
`x & (x - 1)` 清除最低位的 1。反复执行直到 0，循环次数等于 1 的个数，最坏才 $O(\text{bits})$。

## 三、形式化与数学基础
每次操作 $x \leftarrow x \land (x-1)$ 使 $\text{popcount}(x)$ 减 1。迭代次数 $= \sum_i b_i$（$b_i$ 为第 i 位）。

## 四、代码实现
```python
def popcount(x):
    cnt = 0
    while x:
        x &= x - 1   # 清除最低位 1
        cnt += 1
    return cnt

def lowest_bit(x):
    return x & (-x)  # 取出最低位的 1
```

## 五、与其他技术对比
查表法 $O(1)$ 但占内存；现代 CPU 有硬件 `POPCNT` 指令；分治法（SWAR）可并行计数。

## 六、常见误区
- 负数在 Python 中无限长，`x & (x-1)` 仍有效但循环次数多，需用掩码限定。
- 把 `x & -x` 当成 popcount（它只取最低位 1）。

## 七、与开源书/权威来源对应
- K&R 提出该技巧。
- leetcode-master 位 1 的个数题。

## 八、面试题
1. 如何 $O(k)$（k 为 1 的个数）统计 1 的个数？
2. `x & -x` 得到什么？

## 九、演进与趋势
SIMD `vpopcnt`、向量化 popcount 在压缩与机器学习中提速明显。

## 十、小结
`x & (x-1)` 是清除最低 1 的万能技巧，popcount 与 lowest_bit 都基于它。
