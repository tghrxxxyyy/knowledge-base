# Trie与前缀树

> 对应 Fredkin (1960) 提出的 Trie 概念；Sedgewick《Algorithms》字符串章节；《算法导论》第 15 章与字符串匹配相关结构；Bentley & Sedgewick 关于三叉搜索树的论述。

## 一、背景与挑战

字符串字典的经典实现是哈希表：等值查询期望 $O(1)$，但一旦问题变成「所有以 `app` 开头的单词」「两个整数的最大异或值」「按字典序输出前 k 个补全词」，哈希表就束手无策——它抹掉了前缀结构。朴素做法是把所有串排序后二分，前缀查询要两次二分再线性扫，异或问题更是要枚举对。我们需要一种**按字符路径共享前缀**的结构，让查询代价只与键的长度有关，而不是与集合规模有关。

Trie（读作 /traɪ/，源自 retrieval）正是这样一种树：根到结点的路径拼出一个前缀，边标记字符，终止标记表示「这是一个完整键」。它的三大优势是：**前缀共享**（公共前缀只存一份）、**查询与 n 无关**（只与模式串长度 L 有关）、**天然支持字典序与前缀枚举**。因此它是自动补全、拼写检查、IP 路由（LC 前缀匹配）、敏感词过滤、字典树计数、最大异或对（01-Trie）等问题的标准结构。

在面试与竞赛中，Trie 是「字符串 + 状态空间」类问题的万能钥匙：单词搜索 II、添加与搜索单词（通配 `.`）、前缀统计、最大异或对、字典树上的 DP，都是高频题。

## 二、核心原理

**结点与边。** 每个结点代表一个前缀；从父到子的边带一个字符（或位）；结点可含：

- `children`：字符 → 子结点映射（数组或哈希）
- `is_end`：该前缀是否为某个键的结束
- 可选计数 `cnt`：以该前缀为前缀的键数量（前缀计数）
- 可选 `val`：该键关联的值（做 map 用）

**插入。** 从根出发，逐字符走到（或创建）对应子结点，最后把 `is_end` 置真。时间 $O(L)$，$L$ 为串长。

**精确查找。** 逐字符下行，走完后看 `is_end`。中途缺边即失败。与插入同样 $O(L)$。

**前缀查找（starts_with）。** 逐字符下行，能走完前缀即返回真（不必要求 `is_end`）。$O(|prefix|)$。

**删除。** 沿路径递归删除，并在回溯时删掉「既不是终止结点、又无子结点」的冗余结点，避免空间膨胀。

**01-Trie（二进制 Trie）。** 把整数看成固定位宽（如 31 位）的 0/1 串，每个结点只有两个孩子。它支持：

- 插入/查询某数是否在集合中；
- **最大异或对**：对每个 $a_i$，在 Trie 上按位贪心——若与 $a_i$ 当前位相反的孩子存在就走相反位（最大化异或），否则走同侧。单次 $O(\text{位宽})$。
- 动态维护最大/最小异或配对。

**压缩 Trie（Radix / Patricia）。** 把单链压缩成一条边携带子串，减少结点数与指针跳转；Linux 路由表、HDFS 的 NameNode 目录树、拼写检查常用。

**边界条件。** 字符集大小影响子结点表示（26 字母用数组，Unicode 用哈希/双数组）；`is_end` 与「存在路径」必须区分（`"app"` 在但 `"apple"` 不在时，前缀查找 `app` 真、精确查找 `app` 可能真也可能假）；空串是否算键；01-Trie 要固定位宽对齐。

## 三、形式化与数学基础

**时间复杂度。** 插入/查找均为 $O(L)$，与集合中键数 $n$ 无关。前缀枚举输出 $k$ 个结果需 $O(|p| + k)$。

**空间复杂度。** 最坏 $n$ 个互不共享前缀的长度 $L$ 串，结点数 $O(nL)$；若字符集 $\sigma$ 用数组存孩子，指针空间 $O(\sigma n L)$。共享前缀越多越省：$n$ 个随机长 $L$ 串的期望共享使结点数接近 $O(n)$ 量级（前缀树的压缩性质）。

**01-Trie 最大异或正确性。** 设当前位为第 $b$ 位。异或值第 $b$ 位为 1 当且仅当两数在该位不同。贪心从高到低：只要存在相反位的子树，就一定能使更高位的异或贡献不降，故贪心得到全局最大。形式化：若集合 $S$ 中存在 $x$ 与 $a$ 的最高不同位为 $b$，则 $a \oplus x$ 在第 $b$ 位为 1，任何走同侧的路径在更高位与 $x'$ 至多相等、在 $b$ 位为 0，更小。

**与后缀结构对比。** Trie 处理「前缀性质」；后缀数组/后缀树处理「任意子串」。后缀 Trie 结点数 $O(n^2)$，后缀树压缩后 $O(n)$，后缀数组 $O(n)$ 配 LCP 更省空间。

**字典序性质。** 深度优先（按字符序）遍历 Trie 恰好输出字典序——这是「按序输出补全」的直接依据。

## 四、代码实现

完整可运行的 Trie（插入、查找、前缀、删除）与 01-Trie 最大异或对：

```python
class TrieNode:
    __slots__ = ("children", "is_end", "cnt")

    def __init__(self):
        self.children = {}
        self.is_end = False
        self.cnt = 0  # 以此前缀为前缀的键数


class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, s):
        node = self.root
        for c in s:
            if c not in node.children:
                node.children[c] = TrieNode()
            node = node.children[c]
            node.cnt += 1
        node.is_end = True

    def search(self, s):
        node = self._walk(s)
        return node is not None and node.is_end

    def starts_with(self, p):
        node = self._walk(p)
        return node is not None

    def count_prefix(self, p):
        node = self._walk(p)
        return node.cnt if node else 0

    def delete(self, s):
        def dfs(node, i):
            if i == len(s):
                if not node.is_end:
                    return False
                node.is_end = False
                return len(node.children) == 0 and node.cnt == 0
            c = s[i]
            if c not in node.children:
                return False
            child = node.children[c]
            if dfs(child, i + 1):
                del node.children[c]
            node.cnt -= 1
            return not node.is_end and len(node.children) == 0
        dfs(self.root, 0)

    def _walk(self, s):
        node = self.root
        for c in s:
            if c not in node.children:
                return None
            node = node.children[c]
        return node


class Trie01:
    """整数 01-Trie，支持最大异或查询。BIT=31 表示非负 int。"""

    def __init__(self, bit=31):
        self.bit = bit
        self.child = [[-1, -1]]  # child[i][0/1]，-1 表示空
        self.child.append([-1, -1])  # 结点 0 为根

    def insert(self, x):
        u = 0
        for b in range(self.bit, -1, -1):
            bit = (x >> b) & 1
            if self.child[u][bit] == -1:
                self.child[u][bit] = len(self.child)
                self.child.append([-1, -1])
            u = self.child[u][bit]

    def max_xor(self, x):
        u, ans = 0, 0
        for b in range(self.bit, -1, -1):
            bit = (x >> b) & 1
            want = 1 - bit
            if self.child[u][want] != -1:
                ans |= 1 << b
                u = self.child[u][want]
            else:
                u = self.child[u][bit]
        return ans


def max_xor_pair(nums):
    """经典「最大异或对」：对每个数查一次，O(n·位宽)。"""
    if not nums:
        return 0
    t = Trie01()
    t.insert(nums[0])
    best = 0
    for x in nums[1:]:
        best = max(best, t.max_xor(x))
        t.insert(x)
    return best


if __name__ == "__main__":
    tr = Trie()
    for w in ["apple", "app", "apply", "bat"]:
        tr.insert(w)
    assert tr.search("app") and not tr.search("appl")
    assert tr.starts_with("appl") and tr.count_prefix("app") == 3
    tr.delete("apple")
    assert not tr.search("apple") and tr.search("app")
    print(max_xor_pair([3, 10, 5, 25, 2, 8]))  # 28 = 5^25
```

## 五、与其他技术对比

| 维度 | Trie | 哈希集合 | 平衡树/跳表 | 后缀数组 | 三叉搜索树 |
|------|------|----------|-------------|----------|------------|
| 等值查询 | $O(L)$ | 期望 $O(1)$ | $O(\log n)$ 比较 | $O(\log n)$ | $O(L\log \sigma)$ |
| 前缀查询 | $O(\lvert p\rvert)$ | 不支持 | 二分+扫描 | LCP 可做 | 支持 |
| 字典序枚举 | 天然 | 需排序 | 中序 | 天然 | 天然 |
| 最大异或 | 01-Trie $O(\text{位宽})$ | 不支持 | 需特化 | 不支持 | 需位 Trie |
| 空间 | 前缀共享，可能膨胀 | 负载因子 | 指针 | $O(n)$ 紧凑 | 中等 |
| 典型 | 自动补全、路由、异或 | KV 缓存 | 有序统计 | 子串匹配 | 字符串集合 |

取舍：只要做**前缀/字典序/位贪心**就用 Trie；纯等值用哈希；有序统计用跳表/B+ 树；任意子串用后缀数组。

## 六、常见误区

1. **`is_end` 遗漏导致前缀误判。** `search` 与 `starts_with` 语义不同：路径存在 ≠ 是完整单词。漏掉 `is_end` 会把 `"app"` 当 `"apple"` 命中。
2. **字符集与存储方式不匹配。** 26 字母用长度 26 的数组最快；Unicode/大字符集用哈希或双数组 Trie（DAT），否则内存爆炸。
3. **忘记删除时维护 `cnt` 与孤儿结点。** 否则空间只增不减，前缀计数也错。
4. **01-Trie 不对齐位宽。** 正负数需符号位处理或整体加偏移；位宽不一致会把高位当成数据位，异或贪心走错。
5. **把 Trie 当子串索引用。** Trie 只能回答「前缀」；若要任意子串出现次数，应建后缀自动机/后缀数组，硬套 Trie 会漏解。
6. **忽略空间常数。** 用哈希孩子时每个结点一个 dict，小写英文字典的内存可能超过「排序数组 + 二分」，大批量冷数据要评估。

## 七、与开源书/权威来源对应

- Fredkin, E. *Trie Memory*. CACM 3(9), 1960（Trie 概念起源）。
- Sedgewick & Wayne, *Algorithms* 4th ed., §5.2 Tries（R-way Trie、TST、三向单词查找树）。
- 《算法导论》（CLRS）字符串匹配与后缀结构相关章节；Ukkonen 后缀树论文可作扩展。
- GitHub：`youngyangyang04/leetcode-master` 前缀树专题；`zerotrac/leetcode` 中 421 题（最大异或对）题解。

## 八、面试题

**1. 实现 Trie 的 insert / search / startsWith，并分析复杂度。**
参考答案：逐字符下行，`is_end` 标记完整键。插入/查询 $O(L)$，空间与前缀共享程度有关。注意 `search` 必须看 `is_end`。

**2. 求数组中任意两数的最大异或值。**
参考答案：建 01-Trie，对每个数从高位贪心走相反位，$O(n\cdot 32)$。正确性：贪心高位优先，任何更高位更优的解不会被错过。

**3. 单词搜索 II（在字母矩阵中找所有词）如何用 Trie？**
参考答案：把词表建 Trie，DFS 矩阵时同步走 Trie 路径；命中 `is_end` 则收集并剪枝；可用 Trie 的 `cnt` 优化提前终止，避免每个词单独搜矩阵。

**4. Trie 与哈希表如何选？前缀计数怎么做？**
参考答案：需要前缀/字典序/公共前缀共享选 Trie；纯等值与内存紧凑选哈希。前缀计数在结点维护 `cnt`，插入路径 +1、删除路径 -1，查询走前缀读 `cnt`。

## 九、演进与趋势

- **压缩 Trie / Radix Tree / Adaptive Radix Tree（ART）**：按路径压缩与自适应孩子数组（Node4/16/48/256），把指针跳转与缓存缺失压下去，已成现代内存索引（如 DuckDB、部分网络栈、文件系统目录）主流。
- **双数组 Trie（DAT）**：用两个整型数组编码，空间连续、查询快，词库与输入法常用。
- **后缀自动机/后缀树**：把 Trie 思想推广到子串，解决模式计数、最长重复子串等问题。
- **Trie + 布隆/位图**：敏感词过滤、URL 路由中 Trie 判前缀、位图判精确集，混合结构平衡准确率与内存。
- **硬件与持久化**：NVM 上的 Trie 与 ART 变体、GPU 上的批量 Trie 查询（自动驾驶感知后处理、路由查表）是活跃方向。

## 十、小结

Trie 用「边为字符、路径为前缀」把字符串集合组织成共享前缀的树，插入/查询只与键长有关，并天然支持前缀匹配、字典序枚举与 01-Trie 位贪心。它是自动补全、路由、最大异或等问题的标准答案；配合压缩 Trie/ART，又能扛住工业级内存索引的压力。
