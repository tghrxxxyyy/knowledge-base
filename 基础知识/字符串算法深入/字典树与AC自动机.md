# 字典树与AC自动机

> 对应 Aho & Corasick (1975) "Efficient String Matching: An Aid to Bibliographic Search"，以及 Sedgewick《Algorithms》Trie 章节、CLRS 多模式匹配相关讨论。

## 一、背景与挑战

单模式匹配（KMP）一次只找一个词。实际系统里更常见的是**多模式匹配**：给定成千上万个关键词（敏感词表、入侵检测特征、拼写词典、路由表、IDE 补全词库），在一段文本中**一次性**找出所有模式的所有出现。若对每个模式跑一遍 KMP，总代价 $O(k\cdot(n+m))$，$k$ 大时不可接受；若把模式塞进哈希集合再枚举文本每个起点做子串查询，又要 $O(n\cdot L)$（$L$ 为最长模式长度）的窗口枚举，同样低效。

字典树（Trie）把所有模式按前缀共享存成一棵树，天然消除模式间的重复前缀。但普通 Trie 只能从根做完整匹配，文本中模式可能出现在任意位置，且模式之间互相重叠（如词表 {he, she, his, hers} 中 `ushers` 会同时命中 she 与 hers）。AC 自动机（Aho–Corasick）在 Trie 上叠加 **fail 指针**（失败链接，即 KMP 前缀函数的树形推广），把 Trie 变成可识别"任一模式作为子串出现"的自动机：文本每个字符只前进/沿 fail 回退一次，总代价 $O(n + \sum m_i + \text{命中数})$，与模式个数几乎解耦。

工程中这是基础设施级算法：DFA/IDS（Snort 特征匹配）、内容审核与敏感词过滤（含变形、重叠）、杀软多特征扫描、生物信息学中的多探针匹配、路由最长前缀匹配的某些实现都建立在此。面试里"敏感词过滤怎么设计""如何一次匹配多个关键词"的标准答案就是 AC 自动机；能进一步讲清 fail 树上输出合并、字典序/最左最长策略，属高分回答。

## 二、核心原理

**Trie 层。** 节点表示前缀，边表示字符。插入模式 $P$ 时从根沿字符走或新建节点，末节点标记为"单词结尾"，可挂输出串。查询完整单词是 $O(m)$。Trie 的价值是**前缀共享**与**与规模无关的查找时间**。

**fail 指针。** 对节点 $u$（表示字符串 $s$），$\mathrm{fail}[u]$ 指向 Trie 中表示"$s$ 的最长真后缀"的节点；若不存在，指向根。这是 KMP 的 $\pi$ 在树上的形式：KMP 只有一个模式，状态链是线；AC 把多个模式合进树后，"最长真后缀"可能落在另一个模式的前缀上。构建时按 BFS：根的孩子 fail=根；队列取出 $u$，对每个字符边 $u \xrightarrow{c} v$，令 $\mathrm{fail}[v] = \mathrm{next}[\mathrm{fail}[u]][c]$（若无则继续沿 fail 上跳，工程上常预处理"字典转移"化为图，避免匹配时再跳）。性质：$u$ 的 fail 深度严格小于 $u$，fail 链是根到 $u$ 的一条后缀链。

**匹配。** 状态 $v$ 从根开始，对文本每个字符 $c$：若 $v$ 有 $c$ 转移则走之，否则沿 fail 回退到有转移的祖先（或根）。每到达一个节点，就报告该节点的输出（词尾标记），以及可选地"沿 fail 链收集输出"——因为 $v$ 对应的字符串的真后缀可能是其他模式。

**输出合并（优化）。** 预处理 $\mathrm{output}[u]$ 为"$u$ 及其 fail 祖先上的所有词尾"的紧凑列表（或 `dict_suffix_link` 指向最近的有输出的 fail 祖先），匹配时 $O(1)$ 拿到全部命中，避免每次沿 fail 链爬。

**正确性直觉**：任何模式 $P$ 在文本中的出现，结束于位置 $i$ 时，$P$ 必是 $T[..i]$ 的后缀；自动机状态恰好维护了 $T[..i]$ 的"最长后缀同时也是某模式前缀"的节点，fail 保证不丢任何更短后缀上的模式。这与 KMP 的不变量同源。

## 三、形式化与数学基础

**语言。** AC 自动机识别的语言是 $\Sigma^* P_1 \Sigma^* \cup \cdots \cup \Sigma^* P_k \Sigma^*$，即"包含任一模式作为子串"的文本。

**fail 的定义。** 对节点 $u$ 表示的串 $w(u)$，

$$
\mathrm{fail}[u] = v \ \text{s.t.}\ w(v) = \text{最长真后缀 of } w(u) \text{ 且 } w(v) \in \mathrm{Pref}(\{P_i\}).
$$

若不存在则 $v=$ 根。构造 BFS 保证计算 $\mathrm{fail}[v]$ 时 $\mathrm{fail}[u]$ 已知，且 $\mathrm{next}[\mathrm{fail}[u]][c]$ 可递推。

**复杂度。** 设模式总长 $M=\sum |P_i|$，文本长 $n$，字母表 $\sigma$。
- 构建 Trie：$O(M)$；
- 构建 fail（BFS + 字典转移）：$O(M\cdot\sigma)$ 或均摊 $O(M)$（不显式建转移图时匹配会跳 fail）；
- 匹配：每个字符沿转移图走 $O(1)$、fail 回退总次数 $O(n)$（深度均摊），加上输出；若使用输出合并，总输出开销与命中数成正比。

故总时间 $O(M + n + \text{occ})$，空间 $O(M\sigma)$ 或 $O(M)$（边用哈希/字典）。

**与 KMP 的关系。** 单模式时 AC 退化为 KMP：树是一条链，fail 即 $\pi$。

**与 SAM 的区别。** SAM 识别"文本的所有子串"并压缩 endpos；AC 识别"模式集作为子串出现"。若模式很多且固定、文本很长且要多次扫描，AC 的预处理 + 线性扫描更优；若单个文本、要子串族统计，SAM 更强。

**最左最长策略。** 敏感词业务常要"最长优先、不重叠"。AC 默认给所有命中；策略层需在输出后维护已覆盖区间，或改造成在词尾沿 fail 跳"最长匹配"并跳过被覆盖位置——这是工程落地时的常见扩展。

## 四、代码实现

```python
from collections import deque


class AhoCorasick:
    """多模式匹配：Trie + fail 指针 + 输出链。"""

    def __init__(self):
        self.next: list[dict] = [{}]
        self.fail: list[int] = [0]
        self.out: list[list[str]] = [[]]  # 该节点命中的模式

    def add(self, word: str) -> None:
        u = 0
        for ch in word:
            if ch not in self.next[u]:
                self.next[u][ch] = len(self.next)
                self.next.append({})
                self.fail.append(0)
                self.out.append([])
            u = self.next[u][ch]
        self.out[u].append(word)

    def build(self) -> None:
        q = deque()
        for ch, v in self.next[0].items():
            self.fail[v] = 0
            q.append(v)
        while q:
            u = q.popleft()
            for ch, v in self.next[u].items():
                f = self.fail[u]
                while f and ch not in self.next[f]:
                    f = self.fail[f]
                self.fail[v] = self.next[f].get(ch, 0)
                # 输出合并：把 fail 目标的输出并入
                self.out[v].extend(self.out[self.fail[v]])
                q.append(v)

    def search(self, text: str) -> list[tuple[int, str]]:
        """返回所有 (结束下标, 模式)。"""
        res = []
        u = 0
        for i, ch in enumerate(text):
            while u and ch not in self.next[u]:
                u = self.fail[u]
            u = self.next[u].get(ch, 0)
            for w in self.out[u]:
                res.append((i, w))
        return res


if __name__ == "__main__":
    ac = AhoCorasick()
    for w in ("he", "she", "his", "hers"):
        ac.add(w)
    ac.build()
    hits = ac.search("ushers")
    # "she" 结束于下标 3，"he" 也结束于 3，"hers" 结束于 5
    assert (3, "she") in hits and (5, "hers") in hits and (3, "he") in hits
    assert all(p in ("he", "she", "his", "hers") for _, p in hits)

    ac2 = AhoCorasick()
    ac2.add("abc")
    ac2.add("bcd")
    ac2.build()
    assert ac2.search("abcd") == [(2, "abc"), (3, "bcd")]
    print("AC ok")
```

## 五、与其他技术对比

| 方案 | 预处理 | 扫描 | 适用 | 备注 |
|------|--------|------|------|------|
| 逐个 KMP | $O(M)$ | $O(kn)$ | 模式很少 | 实现简单 |
| AC 自动机 | $O(M)$ | $O(n+\mathrm{occ})$ | 模式多、文本长 | 默认答案 |
| 后缀自动机/SA | $O(n_{text})$ | $O(m)$ 每次 | 文本固定、查询子串 | 子串族问题 |
| 多模式 BM/Sunday 变体 | $O(M)$ | 常数小 | 英文长模式 | 实现复杂 |
| 正则引擎 (RE2/Hyperscan) | 视规则 | 高度优化 | 复杂规则、生产 | 有编译期 DFA/NFA 优化 |

**取舍**：关键词条数上千、实时过滤 → AC；规则含正则/回溯语义 → 生产上用 Hyperscan/RE2；模式 3～5 个 → 简单 KMP 循环即可，不必上 AC。AC 的内存随总模式长线性增长，百万级词表需双数组/压缩 Trie 或分片。

## 六、常见误区

1. **fail 构建时忘了输出合并，匹配时也不沿 fail 收集。** 会漏掉"长模式的后缀恰为另一模式"的情况，例如词表 {she, hers} 在 `ushers` 中漏 `he`/`hers`。务必在 BFS 时 `out[v] += out[fail[v]]` 或查询时爬 fail。
2. **匹配失配时把状态置根，而不是沿 fail。** 那就成了"每步从头试"，正确性受损（漏模式）且退化。
3. **构建 fail 用了 DFS 导致父节点 fail 未算完。** fail 必须 BFS 层次序，因为要用到 $\mathrm{fail}[u]$ 才能算 $\mathrm{fail}[v]$。
4. **认为 AC 自动处理"重叠/最左最长"。** AC 报告所有出现；业务去重、优先最长需要上层策略，或改造成只在特定状态输出并跳过覆盖区间。
5. **词表含空串或中文/emoji 时字符集处理不当。** 空串会使算法退化（每处都命中）；Unicode 码点与字素簇（grapheme）不一致会导致过滤绕过。工程上应规范化文本（NFKC、小写、全半角）再匹配。

## 七、与开源书/权威来源对应

1. Aho A. V., Corasick M. J. "Efficient String Matching: An Aid to Bibliographic Search", CACM 1975。AC 自动机原始论文。
2. Sedgewick & Wayne《Algorithms》第 5 章（Tries）与第 6 章相关多模式讨论，Trie 与 R-way/TST 的经典教材讲解。
3. cp-algorithms: "Aho-Corasick Algorithm"（https://cp-algorithms.com/string/aho_corasick.html）。
4. 《算法竞赛进阶指南》AC 自动机章节；Hyperscan（Intel 开源）文档可作工程多模式引擎参考。

## 八、面试题

1. **如何在 $O(n+\sum m)$ 内一次匹配上万个关键词？**  
   参考答案：建 AC 自动机——Trie 合并模式、fail 指针指向最长真后缀所在节点、输出链合并；文本单次扫描，每字符转移均摊常数。

2. **fail 指针和 KMP next 的关系？**  
   参考答案：同一思想在不同拓扑上。KMP 的 $\pi$ 是"线"上的最长真前后缀；AC 的 fail 是"Trie"上的最长真后缀（该后缀还必须是某模式前缀）。单模式时 AC ≡ KMP。

3. **敏感词过滤如何做到最长匹配、不重复命中？**  
   参考答案：默认 AC 给出全部结束位置；可按结束位置排序后贪心取最早结束、或对每个位置只保留 fail 链上最长的模式；亦可在命中后把指针跳过该词长度。需明确业务定义。

4. **词表百万级，内存爆了怎么办？**  
   参考答案：用双数组 Trie（DAT）或压缩 Trie 存转移，fail 数组用整型；或按前缀分片多机 AC + 文本切分（注意边界重叠）；也可用位图/哈希存转移，牺牲一点常数。

## 九、演进与趋势

AC 的演进围绕**内存、增量更新与规则表达力**。双数组 Trie（DAT）把转移压成两个整型数组，是词库类产品的经典选择；C++ 的 `cedar`、Java 的多家开源 AC 实现都走这条路。增量插入：经典 fail 需全量 BFS，动态 AC（增量 fail 或根部惰性重建）在热更新词表场景被研究。**AC + 正则**：Hyperscan、RE2 等把多模式编译为 NFA/DFA 并做 SIMD 块扫描，工业界内容安全多用它们而非手写 AC。**并行与 SIMD**：对超长文本按块并行，块边界重叠 $\max|P_i|-1$ 以保证正确。**生物信息**：多探针/多引物匹配沿用 AC。面试趋势上，AC 常与敏感词、去重策略、Unicode 规范化一起考；单纯默写 fail 已不够，要能设计输出策略与工程落地细节。

## 十、小结

字典树把多模式按前缀共享压进一棵树，AC 自动机在其上加 fail 指针（树形 KMP），使文本一次扫描就能报告所有模式的所有出现，总代价与模式总数弱相关。理解三个层次——Trie 节点即前缀、fail 即最长真后缀、输出链合并——就能设计出正确的多模式引擎，并在敏感词、入侵检测、词典索引等场景落地。它是单模式匹配走向现实工程规模的必经之路。
