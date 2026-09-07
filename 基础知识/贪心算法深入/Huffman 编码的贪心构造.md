# Huffman 编码的贪心构造

> 对应 Huffman 1952（Proc. IRE）与 CLRS 第 16.3 章（Huffman Codes）。

## 一、背景与挑战
给定字符频率，构造前缀码使加权总长最小（数据压缩）。暴力枚举前缀码空间巨大。

## 二、核心原理
每次合并频率最小的两个节点，形成新节点频率为二者之和。重复直到只剩根。这等价于构造最优二叉树（叶深即码长）。

## 三、形式化与数学基础
设字符频率 $p_i$，码长 $l_i$，目标最小化 $B=\sum_i p_i l_i$。贪心选择性质：频率最小的两个字符在最Deep 层且互为兄弟，可先合并。

## 四、代码实现
```python
import heapq

def huffman(freqs):
    # freqs: list of (freq, char) or just freqs list
    pq = [(f, i) for i, f in enumerate(freqs)]
    heapq.heapify(pq)
    total = 0
    while len(pq) > 1:
        a = heapq.heappop(pq)
        b = heapq.heappop(pq)
        merged = a[0] + b[0]
        total += merged
        heapq.heappush(pq, (merged, -1))
    return total  # 加权路径长度
```

## 五、与其他技术对比
定长编码浪费空间；算术编码/ANS 在现代压缩中更高效，但 Huffman 简单且无专利障碍，仍广泛用于 ZIP、JPEG。

## 六、常见误区
- 认为出现频率最高的字符一定编为最短码（仅当合并顺序支持）。
- 用非前缀码导致解码歧义。

## 七、与开源书/权威来源对应
- Huffman 1952 原始论文提出贪心合并。
- CLRS 16.3 给出最优子结构与贪心正确性。
- leetcode-master 哈夫曼树专题。

## 八、面试题
1. 为什么 Huffman 是最优前缀码？
2. 若频率含 0 如何处理？

## 九、演进与趋势
自适应 Huffman、与算术编码结合的上下文建模，是压缩算法演进方向。

## 十、小结
Huffman 通过反复合并最小频率节点的贪心，求得最优前缀码，是贪心在信息论中的经典应用。
