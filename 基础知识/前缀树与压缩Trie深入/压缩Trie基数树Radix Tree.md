# 压缩Trie基数树Radix Tree

> 对应 Morrison (1968) "PATRICIA — Practical Algorithm To Retrieve Information Coded in Alphanumeric"；以及 Linux 内核 radix tree / fib_trie、以及 Comer (1979) 对 Trie 压缩的分析。

## 一、背景与挑战

标准 Trie 的空间瓶颈很明显：节点按"每个字符一个节点"建，若键集合中大量键共享长前缀、或存在很长的单出度链（例如 URL 前缀 `https://www.example.com/api/v1/...`），树里会出现一长串**只有一个孩子**的节点——它们几乎不携带信息（没有分支），却消耗内存与缓存行。极端情况下，$N$ 个长度 $m$ 的键、前缀共享差，节点数 $O(Nm)$，每节点又带哈希/指针，内存占用和 cache miss 都不理想。

**Radix Tree（基数树，也称 Patricia Trie / 压缩 Trie / 前缀树压缩）** 的做法是：把"单出度链"折叠成**一条带字符串标签的边**。节点只在**分支处**（出度 $\ge 2$）或**键结束处**保留。这样节点数从 $O(\text{字符总数})$ 降到 $O(\text{分支数}+N)$，查询仍是 $O(m)$（按标签批量跳过）。Linux 内核的路由表（`fib_trie`）、内存管理的 page radix tree、etcd/Redis 的一些索引、IP 地址最长前缀匹配，都是它的工程化身。

工程与面试中，Radix Tree 常被问：与标准 Trie 的差别（空间）、查询为何仍 $O(m)$（标签匹配）、插入时"分裂边"如何处理、最长前缀匹配怎么维护。它是"用边标签换内存"这一设计手法的教科书案例，也是理解数据库索引、文件系统目录树、路由表的钥匙。面试里能画出"折叠前后对比图"并解释分裂逻辑，通常即达标。

## 二、核心原理

**结构。** Radix Tree 是一棵树，每条边带一个非空字符串标签（或字符区间）；根到节点的路径上**边标签拼接**得到该节点表示的字符串。约束：

1. 任一节点的出边标签**首字符互不相同**（否则可继续合并）；
2. 除根外，非叶节点要么出度 $\ge 2$，要么是键结尾（否则可与父合并）；
3. 键可终止在内部节点（该节点有 `is_end`），此时它也是更长键的前缀。

**插入。** 沿树匹配键 $w$：
- 若完全匹配到节点且该节点 `is_end`，标记即可（或更新值）；
- 若在某条边上发生部分匹配（标签 `abcdefgh` 与 $w$ 只共享 `abc`，且下不同），**分裂**这条边：建中间节点 $u$，原边变成"父 → $u$（公共前缀）"，再挂 "$u$ → 原子节点（剩余后缀）" 与 "$u$ → 新分支（$w$ 剩余）"；
- 若走完边后 $w$ 还有剩余，则在末尾新建叶节点。

**查找。** 从根出发，每次用当前剩余键与出边标签做前缀比较（或按首字符选边再比较标签），匹配则吞掉标签继续；完全走完且 `is_end` 才算找到。

**最长前缀匹配（LPM）。** 与 Trie 相同：边走边记录最近的 `is_end`。Radix 上路由表项常作为"键"插入，查询 IP 位串。

**压缩收益。** 设原 Trie 有 $U$ 个单出度链节点，压缩后节点数 $\approx$ 分支节点 + 键结尾节点。最坏仍是 $O(Nm)$（键两两无共享且无长链时本来就无链可折），典型 URL/路径/路由数据可省数倍至数十倍。

**正确性不变量**：任意两键的"分叉点"唯一存在；折叠不改变可识别语言，只合并等价路径。

## 三、形式化与数学基础

设键集合 $K$，字符总长 $M=\sum|w|$。标准 Trie 节点数 $V_{\text{trie}} \le M+1$。Radix Tree 节点数

$$
V_{\text{radix}} \le 2N + B,
$$

其中 $B$ 为分支节点数，且 $V_{\text{radix}} \le V_{\text{trie}}$，实测在长共享前缀场景下降一个数量级。

**查询复杂度。** 每步匹配一条边标签，总比较字符数不超过 $|w|$，加上选边 $O(1)$（哈希/数组/有序）或 $O(\log d)$（$d$ 为出度）。故 $O(m)$；实现上标签比较可 `memcmp`/切片，缓存友好。

**分裂的均摊。** 每次插入至多分裂一条边、新增 $O(1)$ 个节点；故插入均摊 $O(m)$。删除若要合并（恢复"单出度非结尾"合并）也是 $O(m)$，工程常懒惰不合并。

**与 PATRICIA。** Morrison 的 PATRICIA 用"跳过位"与外部叶子存键，内部节点只存分支位，适合二进制（IP）；广义 Radix Tree 用变长标签。两者都是"路径压缩"思想。

**下界直觉。** 树必须能区分所有键：至少 $N$ 个叶/结尾，分支结构由"键之间的第一个不同位置"决定，Radix 恰好把这些分叉点显式化。

## 四、代码实现

```python
class RadixNode:
    __slots__ = ("children", "is_end", "value")

    def __init__(self):
        # children: 标签首字符 -> (标签, 子节点)
        self.children: dict[str, tuple[str, "RadixNode"]] = {}
        self.is_end = False
        self.value = None


class RadixTree:
    def __init__(self):
        self.root = RadixNode()

    def insert(self, key: str, value=None) -> None:
        node = self.root
        s = key
        while s:
            ch = s[0]
            if ch not in node.children:
                node.children[ch] = (s, RadixNode())
                child = node.children[ch][1]
                child.is_end = True
                child.value = value
                return
            label, child = node.children[ch]
            # 计算公共前缀长度
            i = 0
            while i < len(label) and i < len(s) and label[i] == s[i]:
                i += 1
            if i == len(label):
                node = child
                s = s[i:]
                continue
            # 分裂：label[:i] 公共，新建 mid
            mid = RadixNode()
            rest_label = label[i:]
            rest_s = s[i:]
            node.children[ch] = (label[:i], mid)
            mid.children[rest_label[0]] = (rest_label, child)
            if not rest_s:
                mid.is_end = True
                mid.value = value
            else:
                new_node = RadixNode()
                new_node.is_end = True
                new_node.value = value
                mid.children[rest_s[0]] = (rest_s, new_node)
            return
        node.is_end = True
        node.value = value

    def search(self, key: str):
        node = self._walk(key)
        if node and node.is_end:
            return node.value
        return None

    def _walk(self, key: str):
        node = self.root
        s = key
        while s:
            ch = s[0]
            if ch not in node.children:
                return None
            label, child = node.children[ch]
            if not s.startswith(label):
                return None
            s = s[len(label):]
            node = child
        return node

    def longest_prefix_match(self, key: str):
        node = self.root
        best = None
        s = key
        while s:
            ch = s[0]
            if ch not in node.children:
                break
            label, child = node.children[ch]
            if not s.startswith(label):
                # 部分匹配标签内部也可能有 LPM？——键是整标签插入，内部无 is_end
                break
            s = s[len(label):]
            node = child
            if node.is_end:
                best = node.value
        return best

    def keys(self) -> list[str]:
        out: list[str] = []

        def dfs(u: RadixNode, path: str) -> None:
            if u.is_end:
                out.append(path)
            for label, v in u.children.values():
                dfs(v, path + label)

        dfs(self.root, "")
        return sorted(out)


if __name__ == "__main__":
    rt = RadixTree()
    rt.insert("romane", 1)
    rt.insert("romanus", 2)
    rt.insert("romulus", 3)
    rt.insert("rubens", 4)
    rt.insert("ruber", 5)
    rt.insert("rubicon", 6)
    rt.insert("rubicundus", 7)
    assert rt.search("romane") == 1
    assert rt.search("roman") is None
    assert rt.search("rubicon") == 6
    assert "romanus" in rt.keys() and len(rt.keys()) == 7
    # LPM 测试
    rt2 = RadixTree()
    rt2.insert("a", "A")
    rt2.insert("ab", "AB")
    rt2.insert("abc", "ABC")
    assert rt2.longest_prefix_match("abcd") == "ABC"
    assert rt2.longest_prefix_match("abx") == "AB"
    assert rt2.longest_prefix_match("ax") == "A"
    print("RadixTree ok")
```

## 五、与其他技术对比

| 结构 | 空间 | 查询 | 插入 | LPM | 典型 |
|------|------|------|------|-----|------|
| 标准 Trie | 大 | $O(m)$ | $O(m)$ | 易 | 教学、动态补全 |
| Radix/Patricia | 小 | $O(m)$ | $O(m)$ 摊还 | 易 | 路由、路径索引、内核 |
| 双数组 Trie | 极小 | $O(m)$ 近数组 | 构建难 | 视实现 | 静态大词库 |
| B+ 树 | 中 | $O(\log N)$ | $O(\log N)$ | 范围友好 | 数据库 |
| 哈希 | 中 | $O(m)$ 期望 | $O(m)$ | 否 | 精确键 |

**取舍**：内存敏感且键为字符串/路径/IP → Radix；要极致查询且静态 → DAT；磁盘持久与范围 → B+ 树/FST。

## 六、常见误区

1. **分裂时公共前缀长度算错（等于标签长或等于键长未处理）。** `i == len(label)` 要继续下钻；`i < len(label)` 必须分裂，否则插入静默失败或破坏键。
2. **出边首字符重复。** 违反不变量，查询会歧义。插入后要保证首字符唯一。
3. **LPM 只认叶节点。** 键可终止在内部节点；必须沿途记 `is_end`，不能只看最后。
4. **删除不合并导致树退化。** 长期动态删除后出现单出度链，空间优势丧失；需要周期性合并或重建。
5. **标签用切片比较忘记剩余键。** Python `str` 切片会产生新对象；大标签高频比较时应注意实现效率（C 用指针+长度）。

## 七、与开源书/权威来源对应

1. Morrison D. R. "PATRICIA — Practical Algorithm To Retrieve Information Coded in Alphanumeric", JACM 1968。
2. Comer D. "Analysis of a Heuristic for Full Trie Minimization", IEEE TC 1979；以及其关于 trie 压缩的系列工作。
3. Linux kernel: `lib/radix-tree.c`、`net/ipv4/fib_trie.c`（路由 LPM 工程实现）。
4. Wikipedia: "Radix tree" / "Patricia trie"；etcd / Redis 中路径索引的实现说明。

## 八、面试题

1. **Radix Tree 如何插入并分裂边？**  
   参考答案：找到最长公共前缀 $i$；若 $i$ 等于标签长则下钻；否则建中间节点，把原标签剩余挂一边、新键剩余挂另一边（或终止于中间）。见代码。

2. **为什么查询仍是 $O(m)$？**  
   参考答案：每次比较吞掉整段标签，总比较字符数 $\le |key|$；选边 $O(1)$（哈希）或 $O(\log d)$。

3. **与标准 Trie 的空间对比？**  
   参考答案：节点只在分支/结尾保留，折叠单出度链；长共享前缀（URL、路径）可省数倍内存，并减少 cache miss。

4. **路由表为何常用 Radix/Patricia？**  
   参考答案：IP 前缀是二进制位串，LPM 高频；路径压缩后查询快、更新可控；Linux fib_trie 即此思路。

## 九、演进与趋势

Radix Tree 的演进在**并发、持久化与硬件**。无锁/RCU 并发 Radix（内核、内存分配器）支撑高并发路径查找；可持久化 Radix 用于版本化配置（etcd）；HAT-trie、burst trie 把 Trie 块式存储，提升缓存局部性，适合海量键。网络可编程交换机用 TCAM/算法硬件做 LPM。数据库与文件系统中，路径前缀索引、对象存储键管理也采用压缩 Trie。与之竞争的 FST（有限状态转换器）在词典压缩上更强（可表示多串共享后缀），是 Lucene 的核心。面试趋势：常考"设计一个高并发路由/配置前缀索引"，要求讲清 RCU/分段锁、内存布局与 LPM 不变量。

## 十、小结

Radix Tree 用边标签折叠单出度链，把"按字符建节点"压成"按分支建节点"，空间大幅下降而查询仍线性。插入的边分裂、LPM 的沿途记录、删除后的合并，是实现三大关键。它是路由表、路径索引与内存敏感场景的主力结构，也是从 Trie 走向工业索引的必修课。
