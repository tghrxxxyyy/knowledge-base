# AC自动机基于Trie的多模式匹配

> 对应 CLRS。

## 一、背景与挑战
多模式匹配（如敏感词过滤）需要在一个文本中同时查找成百上千个模式。逐模式跑 KMP 是 $O(N\cdot M)$，AC 自动机用 Trie + 失配指针降到线性。

## 二、核心原理
把全部模式插入 Trie，再为每个节点建「失配指针」(fail) 指向最长真后缀对应的状态（类似 KMP 的 next 数组提升到树上）。文本扫描时沿 Trie/失败指针走，匹配即收集。

## 三、形式化与数学基础
建树与失配指针 $O(\sum |p_i|)$，文本扫描 $O(n + 命中数)$。总复杂度：
$T=O(\sum |p_i| + n + 命中数)$，与模式数无直接乘性关系。

## 四、代码实现
```python
from collections import deque
class ACNode:
    def __init__(self):
        self.children = {}
        self.fail = None
        self.out = []
def build_ac(patterns):
    root = ACNode()
    for p in patterns:
        node = root
        for c in p:
            node = node.children.setdefault(c, ACNode())
        node.out.append(p)
    q = deque()
    for child in root.children.values():
        child.fail = root
        q.append(child)
    while q:
        cur = q.popleft()
        for c, nxt in cur.children.items():
            f = cur.fail
            while f and c not in f.children:
                f = f.fail
            nxt.fail = f.children[c] if f and c in f.children else root
            nxt.out += nxt.fail.out
            q.append(nxt)
    return root
```

## 五、与其他技术对比
相比对每个模式单独 KMP，AC 自动机一次扫描文本即可。相比 Aho-Corasick 的 Trie 版，后缀数组需配合多查询技巧。

## 六、常见误区
失配指针指向「最长真后缀」而非任意后缀；建指针时漏继承父节点的 `out` 会导致漏匹配。

## 七、与开源书/权威来源对应
Aho 与 Corasick 1975 原始论文；CLRS 在字符串匹配章节将其作为有限自动机推广。

## 八、面试题
在文本中统计每个模式出现次数；或实现带删除的多模式匹配。

## 九、演进与趋势
与双数组 Trie 结合成 ACDAT 提升缓存；配合增量更新用于实时敏感词库。

## 十、小结
AC 自动机在 Trie 上增加失配指针，将多模式匹配降为 $O(n + 命中数)$ 的线性扫描。
