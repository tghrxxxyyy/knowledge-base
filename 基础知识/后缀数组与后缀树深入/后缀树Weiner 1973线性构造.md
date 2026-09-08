# 后缀树Weiner 1973线性构造

> 对应 Weiner 1973。

## 一、背景与挑战
后缀树是把「字符串所有后缀」存入一棵压缩 Trie 的结构，可在 $O(m)$ 内完成模式匹配。Weiner 于 1973 年给出首个线性时间构造算法，开创了后缀树领域。

## 二、核心原理
Weiner 算法从右向左逐个字符地把新后缀插入树中，利用「后缀链接」(suffix link) 在已建树中快速定位插入点。每插入一个后缀，沿后缀链接下降并分裂边，保证总操作线性。

## 三、形式化与数学基础
后缀树有 $n$ 个叶子（每个对应一个后缀），内部节点数 $O(n)$，总边数 $O(n)$。Weiner 的在线插入每步摊还 $O(1)$，故：
$T(n)=O(n)$。

## 四、代码实现
下面给出由后缀数组与高度数组构造后缀树拓扑（LCP 区间树）的线性方法，与 Weiner 树同构：
```python
def suffix_tree_from_sa(sa, lcp):
    n = len(sa)
    root = (0, n - 1, 0)
    stack = [root]
    children = {root: []}
    for i in range(1, n):
        while stack and stack[-1][2] > lcp[i]:
            stack.pop()
        if stack and stack[-1][2] == lcp[i]:
            parent = stack[-1]
        else:
            node = (stack[-1][0], i, lcp[i])
            children.setdefault(stack[-1], []).append(node)
            stack.append(node)
            children[node] = []
            parent = node
        children.setdefault(parent, []).append((i, i, lcp[i]))
    return root, children
```

## 五、与其他技术对比
Weiner 法是「在线、从右向左」；McCreight 1976 改为从左向右且不需后缀链接；Ukkonen 1995 用隐式树 + 后缀链接做在线构造。三者均为 $O(n)$，但 Ukkonen 最易实现。

## 六、常见误区
误以为后缀树叶子数等于字符数：实际叶子数等于后缀数 $n$（通常补一个末字符如 $\$$ 使所有后缀为独立叶子）。混淆后缀链接与后缀数组排名也是常见错误。

## 七、与开源书/权威来源对应
Weiner 1973《On an algorithm for the longest common subsequences》相关构造；CLRS 第 32 章讲解后缀树与后缀数组。

## 八、面试题
说明后缀树匹配为何是 $O(m)$；解释后缀链接的作用。

## 九、演进与趋势
后缀树逐渐被空间更小的后缀数组 + LCP 取代，但在「所有子串」类问题（如后缀自动机等价）中仍具教学价值。

## 十、小结
Weiner 1973 首次以线性时间构造后缀树，奠定字符串索引基础；其树结构与后缀数组通过 LCP 区间树一一对应。
