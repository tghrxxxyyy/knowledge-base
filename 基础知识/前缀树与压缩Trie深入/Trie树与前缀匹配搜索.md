# Trie树与前缀匹配搜索

> 对应 Sedgewick & Wayne《Algorithms》Tries 章节中的前缀匹配与通配查找；以及 Backurs & Indyk 关于编辑距离/前缀检索的讨论背景，工程上常见于搜索引擎 suggest 与路由表。

## 一、背景与挑战

精确匹配只是字符串检索的一半。真实系统大量查询是**前缀型**或**模式型**的：用户在搜索框输入 `app`，期望得到 `apple`、`application`、`appium`；路由表要找"最长前缀匹配"（IP `10.1.2.3` 应匹配表项 `10.1.0.0/16` 而非 `10.0.0.0/8`）；文件系统 glob `*.log`、DNS 后缀匹配、拼写纠错的"前缀一致候选"，都属于同一类问题：**不给完整键，只给键的前缀或带通配的模式，在集合中找所有匹配**。

若用哈希表，前缀查询只能：(1) 全表扫——$O(N\cdot m)$，词库大时不可行；(2) 枚举可能的完整键——若后缀无界则无法枚举。若用有序数组/平衡树，可以 `lower_bound(prefix)` 后顺序扫到前缀不再匹配，$O(\log N + k)$，这其实可行（二分查找前缀下界），但通配符（中间字符不确定）与"每跳一个字符变体"就吃力了。Trie 把前缀匹配变成"走一条路径"：走完前缀 $p$ 后，**整个子树就是答案集**，枚举代价与答案数成正比。这就是 Trie 相对哈希/比较树的不可替代之处。

工程上，前缀搜索是 IDE 补全、命令行补全、IME 输入法、CDN/负载均衡路由、Elasticsearch 的 completion suggester、Redis 的 `SCAN`/前缀键管理的基础语义。面试常考"实现一个支持前缀匹配的词典""如何做最长前缀匹配""通配符 `*` 匹配怎么做"。理解"前缀走完后子树即结果"这一不变量，以及如何在大词库上做剪枝（词频 Top-K、懒展开、分页），是本主题的核心。

## 二、核心原理

**前缀匹配 = 走前缀 + 枚举子树。** 给定前缀 $p$：

1. 从根出发沿 $p$ 的字符走；若中途缺边，结果集为空；
2. 到达节点 $u$（代表前缀 $p$）后，DFS/BFS 遍历 $u$ 的子树，收集所有 `is_end` 节点，路径即完整键。

正确性：任何以 $p$ 为前缀的键 $w$，其路径必经过 $u$；反之 $u$ 子树中任一结尾节点对应键的路径以 $p$ 开头。**子树与答案集一一对应**，这是 Trie 前缀搜索的基石。

**与有序数组二分的对比。** 有序数组上，$p$ 的所有匹配键连续出现在 `lower_bound(p)` 之后，直到前缀失配。时间 $O(\log N + k)$，常数小、缓存友好。Trie 是 $O(|p| + k)$。两者都正确；差异在于：Trie 天然支持**动态插入删除**与**通配/跳变**，有序数组要 $O(N)$ 插入或用平衡树/跳跃表。

**最长前缀匹配（LPM）。** 路由场景要的是"最长的、能匹配查询前缀的表项"。Trie 上从根沿查询串走，**沿途记录最后一个 `is_end`（或表项）**；走不下去时答案就是最后记录的那项。时间 $O(|q|)$。若表项是"任意前缀"（如 CIDR），插入时把表项挂在对应前缀节点；查询时边走边更新。这比线性扫路由表 $O(N)$ 快得多，也是 Linux `fib_trie`、路由器 TCAM/软件路由的原理之一。

**通配符匹配。** 若模式含 `?`（单字符）与 `*`（任意串），可在 Trie 上 DFS+回溯：遇 `?` 尝试所有出边，遇 `*` 可选择跳过或消耗多个字符。最坏指数级，但 Trie 共享前缀可大幅剪枝；更高效做法是把模式编译成 NFA/DFA 再在 Trie 上同步跑（双指针/状态机），或用位并行（Shift-And）。

**Top-K 前缀补全。** 补全不仅要求"有哪些"，还要"最相关"。常见设计：节点上维护子树词频堆（或懒计算），走完前缀后取 Top-K；热路径用缓存。词频更新是工程难点（可延迟重建堆）。

**边界与不变量**：
- 前缀走完不代表有结果——子树里可能没有 `is_end`（若允许删除，需维护子树计数）；
- 空前缀 $p=\varepsilon$ 表示"全部键"，实现要防整树展开打死内存（分页/迭代器）；
- 大小写与 Unicode 规范化必须在插入与查询两端一致。

## 三、形式化与数学基础

设键集合 $K$，前缀 $p$，定义结果集

$$
\mathrm{PrefMatch}(p) = \{ w \in K : p \preceq w \}
$$

（$\preceq$ 表示前缀关系）。Trie 实现满足：

$$
|\mathrm{PrefMatch}(p)| = \#\{\text{子树 } T_u \text{ 中 is\_end 节点}\},\quad u = \delta(s, p).
$$

查询时间 $O(|p| + |\mathrm{PrefMatch}(p)|)$；空间与 $K$ 的 Trie 大小一致。

**LPM 正确性。** 令查询 $q$ 在 Trie 上能走的最长路径对应前缀 $p^* = q[0..\ell]$（$\ell$ 最大可行）。任何表项前缀 $t \preceq q$ 必满足 $t \preceq p^*$（因为 $t$ 可走完且 $|t|\le |p^*|$ 或 $t$ 在路径上）。故答案是路径上最长的"表项节点"。证毕。

**通配复杂度。** 模式 $P$ 中有 $w$ 个 `*`，文本/键长 $n$，朴素 Trie DFS 最坏 $O(|K|_{nodes} \cdot n)$；用 DP 状态 (模式位置, 节点) 可压到 $O(|P| \cdot n)$。工程常用后者或正则引擎。

**与哈希前缀（prefix hash）比较。** 可为每个键的所有前缀建哈希集合，空间 $O(\sum |w|)$，查询 $O(|p|)$ 判存在，但枚举结果仍要索引支撑。Trie 是"集合 + 枚举"一体的结构。

## 四、代码实现

```python
class TrieNode:
    __slots__ = ("children", "is_end", "weight")

    def __init__(self):
        self.children: dict[str, TrieNode] = {}
        self.is_end = False
        self.weight = 0  # 词频，用于 Top-K


class PrefixSearchTrie(TrieNode):
    pass


class PrefixTrie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str, weight: int = 1) -> None:
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, TrieNode())
        node.is_end = True
        node.weight = weight

    def _walk(self, prefix: str):
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return None
            node = node.children[ch]
        return node

    def has_prefix(self, prefix: str) -> bool:
        return self._walk(prefix) is not None

    def search_by_prefix(self, prefix: str) -> list[str]:
        node = self._walk(prefix)
        if node is None:
            return []
        result: list[str] = []

        def dfs(u: TrieNode, path: str) -> None:
            if u.is_end:
                result.append(path)
            for ch, v in u.children.items():
                dfs(v, path + ch)

        dfs(node, prefix)
        return result

    def top_k_with_prefix(self, prefix: str, k: int = 10) -> list[tuple[str, int]]:
        node = self._walk(prefix)
        if node is None:
            return []
        result: list[tuple[str, int]] = []

        def dfs(u: TrieNode, path: str) -> None:
            if u.is_end:
                result.append((path, u.weight))
            for ch, v in u.children.items():
                dfs(v, path + ch)

        dfs(node, prefix)
        result.sort(key=lambda x: (-x[1], x[0]))
        return result[:k]

    def longest_prefix_match(self, query: str) -> str | None:
        """返回 query 的最长前缀键（如路由 LPM）。"""
        node = self.root
        best = None
        for i, ch in enumerate(query):
            if ch not in node.children:
                break
            node = node.children[ch]
            if node.is_end:
                best = query[: i + 1]
        return best


if __name__ == "__main__":
    t = PrefixTrie()
    t.insert("app", 5)
    t.insert("apple", 10)
    t.insert("application", 3)
    t.insert("banana", 8)
    assert sorted(t.search_by_prefix("app")) == ["app", "apple", "application"]
    assert t.search_by_prefix("appz") == []
    assert t.has_prefix("ban") and not t.has_prefix("cat")
    assert t.top_k_with_prefix("app", 2) == [("apple", 10), ("app", 5)]
    t.insert("a", 1)
    t.insert("ab", 2)
    assert t.longest_prefix_match("abc") == "ab"
    assert t.longest_prefix_match("a") == "a"
    assert t.longest_prefix_match("z") is None
    print("PrefixTrie ok")
```

## 五、与其他技术对比

| 方案 | 前缀查询 | 动态插入 | 空间 | 备注 |
|------|----------|----------|------|------|
| 哈希全扫 | $O(N)$ | $O(m)$ | 中 | 仅玩具规模 |
| 有序数组/平衡树 | $O(\log N+k)$ | $O(\log N)$ | 中 | 静态/半静态不错 |
| 标准 Trie | $O(m+k)$ | $O(m)$ | 较大 | 通配、LPM 自然 |
| Radix Tree | $O(m+k)$ 摊还 | $O(m)$ | 更省 | 路由/内核常用 |
| FST/DAWG | 类似 | 难 | 极省 | 词典、形态学 |
| 向量检索 | 语义 top-k | 易 | 大 | 补全新趋势 |

**取舍**：纯最长前缀路由 → Radix/二进制 Trie；输入法/命令补全 → 标准/压缩 Trie + 词频；自然语言"模糊补全" → 向量 + 混合。通配符重则考虑正则引擎而非裸 Trie DFS。

## 六、常见误区

1. **`has_prefix` 为真就以为有结果。** 路径存在≠子树有词。删除后子树可能空；应维护子树计数或枚举时再判断。
2. **LPM 只看最后节点，忘了"边走边记录"。** 最长匹配可能在中间节点结束（表项 `a`、`ab`，查 `abc` 答 `ab`）；必须沿途更新 `best`。
3. **空前缀/超短前缀直接 DFS 整树。** 百万词库会打爆内存与延迟；应分页、限制 `k`、或用迭代器惰性展开。
4. **大小写/Unicode 不一致。** 插入 `Apple` 查询 `apple` 找不到；须统一 lower()/NFKC。
5. **用数组子节点扫描出边导致枚举超慢。** 大 $\Sigma$ 下应只存实际出边（dict），DFS 才不会遍历空槽。

## 七、与开源书/权威来源对应

1. Sedgewick & Wayne《Algorithms》第 5 章 Tries：前缀匹配、wildcard match、TST。
2. Fredkin (1960) "Trie Memory"；以及 Morrison (1968) PATRICIA——压缩前缀树的源头。
3. Linux 内核 `lib/radix-tree` 与 `net/ipv4/fib_trie.c`（路由 LPM 的工程实现）。
4. Redis SCAN / Elasticsearch Completion Suggester 文档——前缀补全的系统设计参考。

## 八、面试题

1. **实现前缀查询并返回所有匹配词。**  
   参考答案：见 `search_by_prefix`。走前缀到节点 $u$，DFS 子树收集 `is_end`。复杂度 $O(|p|+k)$。

2. **路由表最长前缀匹配怎么做？**  
   参考答案：前缀插入 Trie，查询沿地址位/字符走，沿途记住最后一个表项节点；$O(|q|)$。硬件上常用 TCAM，软件上 fib_trie/二进制 Trie。

3. **支持 `?` 与 `*` 的匹配，Trie 上如何做？**  
   参考答案：DFS 回溯，`?` 尝试所有出边，`*` 可 0..n 次；或 DP 状态 (模式位置, 节点) 降到 $O(|P|\cdot n)$。复杂模式交给正则引擎更稳。

4. **补全如何返回 Top-10 热词？**  
   参考答案：节点维护子树词频聚合或懒堆；走完前缀取堆顶 k 个；更新可打标延迟重建。缓存热门前缀效果显著。

## 九、演进与趋势

前缀匹配的工程演进有三股力量。其一，**压缩与缓存**：Radix Tree、HAT-trie、burst trie 把 Trie 装进更缓存友好的布局，适合十亿级键。其二，**语义补全**：IDE 与搜索框从"字面前缀"走向"嵌入向量 + 字面前缀混合过滤"（先向量召回再前缀/约束过滤），这是 LLM 时代补全系统的主流形态。其三，**并发与持久化**：无锁 Trie、可持久化 Trie 服务版本化配置与审计。网络侧，可编程交换机（P4）与 eBPF 用硬件/字节码实现 LPM。面试里，前缀搜索常与系统设计结合：设计一个补全服务要考虑索引分片、词频更新、缓存与降级，而不只是 Trie 代码。

## 十、小结

Trie 的前缀匹配本质是"走完前缀，子树即结果"，配合沿途记录可解决最长前缀匹配，配合 DFS/DP 可做通配符。它把前缀查询从哈希的无能为力与比较树的间接操作，变成直观的路径操作，代价是空间与工程细节。无论是路由、补全还是词典检索，理解前缀语义与 LPM 不变量，都是正确选型的前提。
