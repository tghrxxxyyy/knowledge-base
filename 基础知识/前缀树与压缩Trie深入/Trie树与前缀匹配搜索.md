# Trie树与前缀匹配搜索

> 对应 CyC2018/CS-Notes。

## 一、背景与挑战
给定词典，判断文本中哪些词以某前缀开头，或收集某前缀下所有单词，是搜索引擎、输入法补全的核心需求。

## 二、核心原理
沿查询前缀逐字符走到对应节点，若该节点存在，则其子树中所有 `is_end` 叶子即该前缀下的完整单词。

## 三、形式化与数学基础
前缀定位 $O(p)$（$p$ 为前缀长），枚举子树单词需遍历子树，总输出 $O(p + k)$（$k$ 为结果数）。最坏子树规模 $O(N)$。

## 四、代码实现
```python
def prefix_search(root, prefix):
    node = root
    for c in prefix:
        if c not in node.children:
            return []
        node = node.children[c]
    res = []
    def dfs(nd, path):
        if nd.is_end:
            res.append(path)
        for ch, child in nd.children.items():
            dfs(child, path + ch)
    dfs(node, prefix)
    return res
```

## 五、与其他技术对比
相比对每个词判断 `startswith`（总 $O(N\cdot p)$），Trie 把前缀定位降到 $O(p)$。相比后缀数组做子串匹配，Trie 专攻前缀。

## 六、常见误区
误把「前缀节点存在」当作「有完整单词」：必须检查子树里是否真的有 `is_end`。忽略空前缀返回全部也是易错点。

## 七、与开源书/权威来源对应
CyC2018/CS-Notes 字符串与 Trie 章节；youngyangyang04/leetcode-master 第 208、211、212 题。

## 八、面试题
实现支持 `.` 通配的字典树查询（LeetCode 211）；或单词搜索 II（矩阵中找字典单词）。

## 九、演进与趋势
与 AC 自动机结合可从前缀匹配扩展到多模式匹配；与压缩结合用于大规模词典。

## 十、小结
Trie 的前缀匹配先 $O(p)$ 定位再 DFS 枚举，是自动补全与敏感词过滤的基石。
