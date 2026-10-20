# 标准Trie树的插入与查询

> 对应 Sedgewick & Wayne《Algorithms》第 5 章 Tries；以及 Fredkin (1960) "Trie Memory" 原始论文、Knuth《计算机程序设计艺术》卷 3 关于数字搜索树/前缀树的讨论。

## 一、背景与挑战

字典、词表、路由表、拼写检查词典、IP 前缀库——这些结构共同的访问模式是：按**字符串键**插入、精确查找，以及按**前缀**枚举。若用平衡二叉搜索树（红黑树）存储，每次比较都要扫描两个键的公共前缀才能分出大小，单次操作 $O(m \log N)$（$m$ 为键长，$N$ 为键数），且前缀查询（"所有以 `app` 开头的词"）需要两次 lower_bound 再中序遍历，逻辑不直观。若用哈希表，精确查找期望 $O(m)$ 很好，但**无法**高效做前缀查询：哈希打散了前缀结构，想知道"有哪些键以 `app` 开头"只能全表扫或另建前缀索引。

Trie（前缀树、字典树）换了一个存储维度：**用边表示字符，而不是用节点比较键**。从根到某节点的路径拼出一个前缀；共享同一前缀的键在树中共享同一条路径。这带来两个直接收益：其一，查找时间只与键长 $m$ 有关，与集合规模 $N$ **无关**（$O(m)$）；其二，前缀查询变成"走到前缀末端节点再 DFS 子树"，极其自然。代价是空间——若键集合前缀共享少，节点数可达 $O(\sum |key|)$，且每个节点要维护子节点表（数组、哈希或指针），常数较大；这也是后续压缩 Trie（Radix Tree）、双数组 Trie 出现的动机。

在工程与面试语境，标准 Trie 是"字符串集合数据结构"的入门与默认答案：面试常问"实现一个 Trie，支持 insert/search/startsWith"，就是 LeetCode 208；更深的问法是"为什么 $O(m)$ 与 $N$ 无关""和哈希表比如何取舍""节点该用数组还是字典"。理解标准 Trie 的插入/查询细节（哪里标记单词结尾、前缀与完整词的区分），是后面 AC 自动机、Radix Tree、DAT 的地基。

## 二、核心原理

**结构。** Trie 是一棵 $|\Sigma|$ 叉树（或用哈希只存实际出现的出边）。每个节点代表"从根到该节点的路径字符串"这一前缀。节点需要两个关键信息：

1. **children**：字符 $\to$ 子节点 的映射；
2. **is_end / count**：该节点是否为某个**完整键**的结尾（以及可选的计数、值负载）。

注意：路径上经过的中间节点只是前缀，不一定是键。比如插入 `car` 与 `cat` 后，`ca` 对应的节点存在但 `is_end=False`；若再插入 `ca`，才把它标为结尾。**前缀与键的区分**是 Trie 最容易被问也最容易写错的点：`search("ca")` 应在只插入 `car` 时返回 False，而 `startsWith("ca")` 返回 True。

**插入。** 从根开始，对键 $w$ 的每个字符 $c$：若当前节点没有 $c$ 边则新建子节点，沿边前进；结束时把最后节点标 `is_end=True`（若实现计数/映射值，同时写入）。时间 $O(m)$，最坏新建 $m$ 个节点。

**精确查询。** 同样走 $m$ 步；若中途缺边则失败；走完还必须检查 `is_end`，否则把前缀误判为键。时间 $O(m)$。

**前缀查询 / startsWith。** 走前缀 $p$；若能走完，说明存在以 $p$ 为前缀的键（前提是该子树下确有 `is_end` 节点——若允许删除，需要维护子树计数或谨慎处理）。枚举所有以 $p$ 开头的键 = 从该节点 DFS，沿途收集 `is_end`。

**删除（进阶）。** 简单做法只把结尾标记去掉；若要回收空节点，需自底向上删除出度为 0 且非结尾的节点，或给节点加引用计数。错误删除（把仍被其他键共享的节点删掉）会破坏其余键——例如删 `car` 不能删 `c→a` 路径，因为 `cat` 还在。

**不变量**：
- 根到节点路径唯一对应一个字符串；
- 任意键 $w$ 存在 $\iff$ 沿 $w$ 能走到某个 `is_end` 节点；
- 共享前缀的键共享路径，节点数 $\le$ 全体键字符总数 $+1$。

## 三、形式化与数学基础

设字符集大小 $\Sigma$，共 $N$ 个键，最大键长 $m_{\max}$，键字符总数 $M=\sum |w|$。

**时间复杂度。** 插入/精确查找/前缀判定均为 $O(|w|)$，与 $N$ 无关。对比：

$$
T_{\text{BST}} = O(|w| \log N),\quad T_{\text{Hash}} = O(|w|)\ \text{期望},\quad T_{\text{Trie}} = O(|w|).
$$

注意 Trie 的 $O(|w|)$ 里每步是 $O(1)$ 的子节点访问：若 children 用数组，$O(1)$；用哈希，期望 $O(1)$；用平衡树存出边，则多 $\log\Sigma$，但通常 $\Sigma$ 小或稀疏哈希够用。

**空间复杂度。** 节点数上界 $M+1$（每个键最多新建其全部字符对应节点；共享只省不增）。每节点若开 $|\Sigma|$ 数组，空间 $O(M\cdot|\Sigma|)$，英文尚可、中文大字符集则爆；用哈希/字典则是 $O(M + E)$，$E$ 为边数，实践中最优。

**前缀共享度。** 设公共前缀越长，节点数越少。最坏（所有键无公共前缀且长度为 $m$）$O(Nm)$ 节点；最好（如大量同前缀）远小于 $Nm$。这就是压缩 Trie 把"单出度链"折成一条边的动机：把空间从"按字符"降到"按分支点"。

**与信息论。** Trie 是对键集合的一种 tries 解释（Bentley–Sedgewick 的 ternary search tries 试图平衡时间/空间）。字符分布高度不均时（英文 `q` 后几乎总跟 `u`），TST（三叉树）与 R-way Trie 各有权衡。

## 四、代码实现

```python
class TrieNode:
    __slots__ = ("children", "is_end", "count")

    def __init__(self):
        self.children: dict[str, TrieNode] = {}
        self.is_end = False
        self.count = 0  # 以该节点为结尾的键的个数（支持重复插入）


class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str) -> None:
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True
        node.count += 1

    def search(self, word: str) -> bool:
        node = self._walk(word)
        return node is not None and node.is_end

    def starts_with(self, prefix: str) -> bool:
        return self._walk(prefix) is not None

    def _walk(self, s: str):
        node = self.root
        for ch in s:
            if ch not in node.children:
                return None
            node = node.children[ch]
        return node

    def words_with_prefix(self, prefix: str) -> list[str]:
        node = self._walk(prefix)
        if node is None:
            return []
        out: list[str] = []

        def dfs(u: TrieNode, path: str) -> None:
            if u.is_end:
                out.append(path)
            for ch, v in u.children.items():
                dfs(v, path + ch)

        dfs(node, prefix)
        return out

    def delete(self, word: str) -> bool:
        """删除一个键；若不存在返回 False。回收空节点。"""
        path: list[tuple[TrieNode, str]] = []
        node = self.root
        for ch in word:
            if ch not in node.children:
                return False
            path.append((node, ch))
            node = node.children[ch]
        if not node.is_end:
            return False
        node.count -= 1
        if node.count == 0:
            node.is_end = False
        # 回收：自底向上删掉无子且非结尾的节点
        for parent, ch in reversed(path):
            child = parent.children[ch]
            if child.is_end or child.children:
                break
            del parent.children[ch]
        return True


if __name__ == "__main__":
    t = Trie()
    for w in ("car", "cat", "ca", "dog"):
        t.insert(w)
    assert t.search("car") and t.search("ca") and t.search("cat")
    assert not t.search("c") and not t.search("cab")
    assert t.starts_with("c") and t.starts_with("ca")
    assert sorted(t.words_with_prefix("ca")) == ["ca", "car", "cat"]
    assert t.delete("car")
    assert not t.search("car") and t.search("cat")
    assert t.delete("cat") and t.delete("ca")
    assert not t.search("ca")
    assert t.search("dog")
    print("Trie ok")
```

## 五、与其他技术对比

| 结构 | 插入 | 精确查找 | 前缀查询 | 空间 | 有序遍历 | 适用 |
|------|------|----------|----------|------|----------|------|
| 哈希表 | $O(m)$ | $O(m)$ 期望 | 不支持/全表扫 | 中 | 否 | 纯精确键值 |
| 平衡 BST | $O(m\log N)$ | $O(m\log N)$ | $O(m\log N + k)$ | 中 | 是 | 需要范围序 |
| 标准 Trie | $O(m)$ | $O(m)$ | $O(m+k)$ | 较大 | DFS 即字典序 | 前缀/补全/词典 |
| Radix/压缩 Trie | $O(m)$ 摊还 | $O(m)$ | $O(m+k)$ | 更省 | 是 | 内核路由、大量共享前缀 |
| 双数组 Trie | $O(m)$ | $O(m)$ | 视实现 | 极省 | 是 | 静态大词库 |

**取舍**：只要键值、无前缀需求 → 哈希；需要范围与有序 → BST；前缀是核心（补全、通配、路由）→ Trie 族。中文/大字符集务必用哈希出边而非数组。

## 六、常见误区

1. **`search` 不检查 `is_end`。** 只要路径存在就返回 True，会把 `car` 存在时的 `ca` 查询判真。必须区分"前缀存在"与"键存在"。
2. **删除时把共享节点一起拆掉。** 删 `car` 若回溯把 `c→a` 删了，`cat` 就坏了。只删"出度为 0 且非结尾"的节点链。
3. **children 用 $|\Sigma|$ 大数组。** 中文/Unicode 上千万码点不现实；应 `dict`/哈希/压缩边。
4. **认为 Trie 一定比哈希快。** 精确查找上哈希常数更小、缓存更友好；Trie 赢在前缀语义与最坏 $O(m)$、无碰撞。单点键值且无前缀，别硬上 Trie。
5. **忘记 DFS 收集时把前缀本身作为 path 拼回去。** `words_with_prefix("ca")` 的结果应带完整前缀，否则调用方拿到 `"r"` 而不是 `"car"`。

## 七、与开源书/权威来源对应

1. Fredkin E. "Trie Memory", CACM 1960。Trie 概念的原始论文（"trie" 取自 re-trie-val）。
2. Sedgewick & Wayne《Algorithms》第 5 章 5.2 "Tries"：R-way trie、TST、比较与用例。
3. Knuth《计算机程序设计艺术》卷 3《排序与查找》关于数字搜索与前缀树的讨论。
4. LeetCode 208. Implement Trie (Prefix Tree) —— 面试标准题面；cp-algorithms "Trie" 页。

## 八、面试题

1. **实现 Trie 的 insert/search/startsWith，并说明复杂度。**  
   参考答案：见上文代码。三操作皆 $O(m)$，$m$ 为单词长；空间与总字符数成正比。`search` 必须看 `is_end`，`startsWith` 不用。

2. **Trie 与哈希表如何选？**  
   参考答案：需要前缀/补全/字典序遍历/无哈希碰撞顾虑 → Trie；纯精确键值、内存敏感、可容忍均摊 → 哈希。也可组合：哈希存热键，Trie 只管补全。

3. **如何支持重复插入计数与删除？**  
   参考答案：节点维护 `count`；插入 `count+=1`，删除 `count-=1`，归零再清 `is_end`；节点回收仅当无子且非结尾，注意共享路径。

4. **中文词典用 Trie 有什么坑？**  
   参考答案：字符集大，不能开数组；应按 Unicode 码点（或字素）走字典边；注意规范化（大小写、全半角）；若只做双数组静态词库，可预分词成整数 ID 再 DAT。

## 九、演进与趋势

标准 Trie 的演进主要在**空间压缩与工程落地**。路径压缩衍生出 Radix Tree / Patricia Trie：单出度链折叠成一条带字符串标签的边，节点数降到分支数级别，Linux 内核路由表、etcd、Redis 有限使用其思想。双数组 Trie（DAT）把转移压成两个 int 数组，查询近乎数组寻址，广泛用于输入法、分词器、敏感词库。Ternary Search Trie 用三叉节点在时间与空间间折中。动态补全场景用 Trie + 词频堆，或转为向量检索（语义补全）——这是当前 IDE 与搜索框的趋势：前缀精确匹配仍是底座，其上叠排序模型。并发与持久化方面，有 lock-free 前缀树、可持久化 Trie（主席树套 Trie）服务区间第 k 大等题。面试中，"手写 Trie"仍是高频基础题，而系统设计题会追问百万词库的内存布局、懒加载与热更新。

## 十、小结

标准 Trie 用"边即字符"把字符串集合组织成前缀共享的树，插入与查询 $O(m)$ 且与规模无关，前缀匹配与字典序遍历是副产品。实现时务必区分前缀与完整键、谨慎处理删除与字符集。它是压缩 Trie、双数组 Trie、AC 自动机等一切字符串索引结构的起点，也是"用结构换查询语义"这一设计思想的典型代表。
