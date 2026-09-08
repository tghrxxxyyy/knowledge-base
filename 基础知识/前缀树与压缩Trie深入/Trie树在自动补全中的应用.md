# Trie树在自动补全中的应用

> 对应 youngyangyang04/leetcode-master。

## 一、背景与挑战
输入法、命令行、IDE 需要根据已输入前缀实时给出候选词并按热度排序。Trie 天然支持前缀枚举，再配合优先级即可补全。

## 二、核心原理
在每个 `is_end` 节点存词频/权重，前缀定位后 DFS 收集候选，用堆取 Top-K。也可在节点上缓存「子树内最高频词」以加速。

## 三、形式化与数学基础
定位 $O(p)$，Top-K 候选收集 $O(\min(N, B^k))$ 再用 $O(k\log k)$ 取前 K。若每节点缓存热门词则查询降到 $O(p + k\log k)$。

## 四、代码实现
```python
import heapq
def autocomplete(root, prefix, k=5):
    node = root
    for c in prefix:
        if c not in node.children:
            return []
        node = node.children[c]
    cand = []
    def dfs(nd, path):
        if nd.is_end:
            cand.append((-nd.freq, path))
        for ch, child in nd.children.items():
            dfs(child, path + ch)
    dfs(node, prefix)
    heapq.heapify(cand)
    return [heapq.heappop(cand)[1] for _ in range(min(k, len(cand)))]
```

## 五、与其他技术对比
相比每次对全词典排序过滤，Trie 只在相关子树内搜索。相比后缀数组适合子串补全，Trie 适合前缀补全。

## 六、常见误区
把权重存在非终止节点导致返回非词；未限制 DFS 规模在超大词典下超时。

## 七、与开源书/权威来源对应
youngyangyang04/leetcode-master 第 692/720 题相关；CyC2018/CS-Notes 提及前缀树应用。

## 八、面试题
设计支持频率更新的自动补全系统；如何持久化 Trie？

## 九、演进与趋势
结合学习排序、上下文预测与压缩 Trie，构建低延迟补全服务。

## 十、小结
Trie 前缀定位 + 频率堆是自动补全的经典方案，可在子树内高效取 Top-K 候选。
