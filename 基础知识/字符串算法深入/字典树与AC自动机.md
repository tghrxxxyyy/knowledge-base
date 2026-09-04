# 字典树与AC自动机

> 对应 Aho-Corasick 1975 论文与《柔性字符串匹配》。

## 一、背景与挑战
多模式匹配：给定一个词典（多个模式）与文本，求所有模式出现位置。Trie 单模式前缀检索，AC 自动机多模式。

## 二、核心原理
Trie 把模式按字符建成树；AC 自动机在 Trie 上为每个结点加 fail 指针（类似 KMP 的 π），使失配时跳到最长可用后缀。

## 三、形式化 / 数学基础
fail 指针：`fail[u]` 为 u 沿父链对应串的最长真后缀所达结点。BFS 层序建立，保证匹配不漏。

## 四、代码实现
```python
from collections import deque
class Aho:
    def __init__(self):
        self.trie = [{}]
        self.fail = [0]
        self.end = [0]
    def insert(self, s):
        u = 0
        for c in s:
            if c not in self.trie[u]:
                self.trie.append({})
                self.fail.append(0)
                self.end.append(0)
                self.trie[u][c] = len(self.trie) - 1
            u = self.trie[u][c]
        self.end[u] += 1
    def build(self):
        q = deque()
        for c, v in self.trie[0].items():
            q.append(v)
        while q:
            u = q.popleft()
            for c, v in self.trie[u].items():
                f = self.fail[u]
                while f and c not in self.trie[f]:
                    f = self.fail[f]
                self.fail[v] = self.trie[f].get(c, 0)
                q.append(v)
```

## 五、与其他技术对比
与逐个 KMP 相比，AC 自动机一次扫描文本 O(n + 总模式长)；Trie 仅支持单模式前缀查询。

## 六、常见误区
fail 指针未做「空转移」压缩导致每步回退多次；建树时根的儿子 fail 应指向根。

## 七、与开源书 / 权威来源对应
- Aho & Corasick 1975
- 代码随想录: https://github.com/youngyangyang04/leetcode-master

## 八、面试题
「单词拆分 II」「敏感词过滤」；「Concatenated Words」。

## 九、演进与趋势
双数组 Trie（Double Array）压缩空间；AC 自动机上 DP（状态机计数）。

## 十、小结
Trie 提供前缀结构，AC 自动机用 fail 指针把多模式匹配降为一次线性扫描。
