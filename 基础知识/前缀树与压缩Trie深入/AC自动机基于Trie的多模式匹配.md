# AC自动机基于Trie的多模式匹配

> 对应 Aho & Corasick (1975) "Efficient String Matching: An Aid to Bibliographic Search", CACM 18(6)。工程参考见 Hyperscan、darts-clone 等多模式引擎实现。

## 一、背景与挑战

多模式匹配（multi-pattern matching）指：给定模式集合 $P=\{P_1,\dots,P_k\}$（总长 $M$），在文本 $T$（长 $n$）中找出**所有** $P_i$ 的所有出现（可重叠、可任意位置）。场景比单模式多得多：内容安全要在一篇帖子里同时扫几千个敏感词；入侵检测要在流量里匹配上千条特征；拼写检查与词典标注要一次识别所有词条；生物信息学要在基因组里找一批探针。

朴素做法是"对每个模式跑一次 KMP"，代价 $O(kn)$ 或 $O(k(n+m))$，$k=10^4$、$n=10^7$ 时完全不可行。另一种"把模式放进哈希集合，枚举文本每个起点试所有长度"是 $O(n L)$（$L$ 为最长模式），同样差。**AC 自动机**把全部模式压进一棵 **Trie**（共享前缀），再在 Trie 上加 **fail 失败指针**，使文本只被扫描一遍，代价 $O(n + M + \text{命中数})$，与模式个数几乎解耦。

这与"基于 Trie"直接相关：没有 Trie 的前缀共享，fail 无处安放；Trie 提供"状态=某个模式前缀"的统一语义，fail 提供"失配后退到最长真后缀前缀"的跳转。工程里，AC 是敏感词过滤、DFA 特征扫描、多路由匹配的标配；面试中"海量关键词过滤"几乎必考 AC。能讲清 fail 的 BFS 构建、输出链合并、以及与 KMP 的关系，是高级候选人的标志。

## 二、核心原理

**Trie 层。** 每个模式 $P_i$ 插入 Trie：节点表示前缀，末节点标记为词尾（可挂模式 ID 列表）。多个模式共享前缀，例如 $\{$he, she, his, hers$\}$ 共享 `h`、`he`、`s` 等。

**fail 指针。** 对节点 $u$（表示串 $s$），$\mathrm{fail}[u]$ 指向表示"$s$ 的最长真后缀、且该后缀仍是某模式前缀"的节点；若无，指根。构建按 **BFS**：

1. 根的子节点 fail=根；
2. 弹出 $u$，对出边 $u\xrightarrow{c} v$：令 $f=\mathrm{fail}[u]$，沿 fail 上跳直到 $f$ 有 $c$ 边或到根，则 $\mathrm{fail}[v] = \mathrm{next}[f][c]$（不存在则根）；
3. **输出合并**：`out[v]` 并入 `out[fail[v]]`（若 fail 节点是词尾，则 $v$ 命中时也要报它）。

性质：fail 链深度严格下降，最终到根；单模式时 Trie 是链，fail 即 KMP 的 $\pi$。

**匹配。** 状态 $v=$ 根，对文本字符 $c$：

- 若 $v$ 有 $c$ 转移，走之；
- 否则沿 fail 回退直到有 $c$ 边或根；
- 每到达节点，报告 `out[v]` 中所有模式（结束位置为当前文本下标）。

因 fail 深度均摊，整段文本回退总次数 $O(n)$。

**输出链与压缩。** 朴素在节点处沿 fail 爬收集所有输出会退化（长 fail 链）。预处理 `dict_suffix_link`（跳到最近有输出的 fail 祖先）或直接把 fail 祖先的输出并入 `out[v]`，可保证匹配 $O(1)$ 取输出。

**不变量**：
- 自动机当前状态 = 文本前缀的最长后缀，该后缀是某模式前缀；
- 失配只沿 fail 走，不丢任何可能的模式后缀；
- 每个文本字符 $O(1)$ 均摊处理。

**与 KMP / SAM 的分工**：KMP 单模式；AC 多模式、只关心"模式是否作为子串出现"；SAM 是文本的子串自动机，适合"文本固定、查询子串族"。

## 三、形式化与数学基础

**语言。** AC 识别

$$
L = \Sigma^* P_1 \Sigma^* \cup \cdots \cup \Sigma^* P_k \Sigma^*,
$$

即"包含任一模式"的文本集合；匹配过程给出所有出现位置。

**fail 定义。** $w(v)$ 为节点 $v$ 的路径串，则

$$
\mathrm{fail}[u] = \arg\max_{v} \{|w(v)| : w(v) \text{ 是 } w(u) \text{ 的真后缀},\ w(v)\in \mathrm{Pref}(P)\}.
$$

**复杂度证明要点。** 构建：Trie $O(M)$；fail BFS 每节点每字符常数（若用字典转移预处理）$O(M\sigma)$ 或均摊 $O(M)$。匹配：定义势能为当前深度，匹配总推进 $n$，回退总次数不超过总推进，故 $O(n)$；加上输出报告 $O(\text{occ})$。合计

$$
T = O(M + n + \mathrm{occ}).
$$

空间：$O(M\sigma)$ 数组或 $O(M)$ 哈希边。

**输出合并正确性。** 若模式 $P_i$ 是 $P_j$ 的后缀，则在 $P_j$ 的词尾节点上沿 fail 必达 $P_i$ 的词尾节点；合并后一次报出，不漏。

**最坏例子。** 模式 $\{a, aa, aaa, \dots, a^k\}$，文本 $a^n$，命中数 $\Theta(nk)$，此时时间由输出主导，这是下界而非缺陷。

## 四、代码实现

```python
from collections import deque


class AhoCorasick:
    def __init__(self):
        self.next: list[dict[str, int]] = [{}]
        self.fail: list[int] = [0]
        self.out: list[list[str]] = [[]]

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
        q: deque[int] = deque()
        for v in self.next[0].values():
            self.fail[v] = 0
            q.append(v)
        while q:
            u = q.popleft()
            for ch, v in self.next[u].items():
                f = self.fail[u]
                while f and ch not in self.next[f]:
                    f = self.fail[f]
                self.fail[v] = self.next[f].get(ch, 0)
                self.out[v].extend(self.out[self.fail[v]])
                q.append(v)

    def finditer(self, text: str):
        u = 0
        for i, ch in enumerate(text):
            while u and ch not in self.next[u]:
                u = self.fail[u]
            u = self.next[u].get(ch, 0)
            for w in self.out[u]:
                yield i, w

    def filter_text(self, text: str, repl: str = "*") -> str:
        """敏感词替换示例：最左最长优先，重叠跳过。"""
        # 按开始位置升序、长度降序，保证最左最长
        hits = sorted(self.finditer(text), key=lambda x: (x[0] - len(x[1]) + 1, -len(x[1])))
        arr = list(text)
        cover = [False] * len(text)
        for end, w in hits:
            start = end - len(w) + 1
            if any(cover[start:end + 1]):
                continue
            for j in range(start, end + 1):
                arr[j] = repl
                cover[j] = True
        return "".join(arr)


if __name__ == "__main__":
    ac = AhoCorasick()
    for w in ("she", "he", "hers", "his"):
        ac.add(w)
    ac.build()
    hits = list(ac.finditer("ushers"))
    assert (3, "she") in hits and (5, "hers") in hits and (3, "he") in hits
    ac2 = AhoCorasick()
    ac2.add("敏感")
    ac2.add("敏感词")
    ac2.build()
    assert ac2.filter_text("这是敏感词测试") == "这是***测试"
    print("AC multi ok")
```

## 五、与其他技术对比

| 方案 | 预处理 | 扫描 | 重叠/最左最长 | 内存 | 场景 |
|------|--------|------|----------------|------|------|
| 逐个 KMP | $O(M)$ | $O(kn)$ | 易 | 小 | 模式极少 |
| AC 自动机 | $O(M)$ | $O(n+\mathrm{occ})$ | 需策略层 | 中 | 敏感词、IDS、多词典 |
| 多模式 BM/Sunday | $O(M)$ | 常数小 | 中 | 小 | 英文长模式 |
| Hyperscan/RE2 | 编译期高 | SIMD 极快 | 规则表达 | 大 | 生产多规则 |
| 后缀数组/自动机 | $O(n_{text})$ | 每次 $O(m)$ | 视查询 | 大 | 文本固定、子串族 |

**取舍**：固定词表 + 实时文本 → AC；规则含正则/复杂边界 → Hyperscan；模式 < 10 → 简单循环 KMP；要最长匹配不重叠 → AC + 贪心覆盖（见 `filter_text`）。

## 六、常见误区

1. **fail 用 DFS 建。** 必须 BFS，否则父 fail 未就绪，结构错乱。
2. **不合并输出 / 匹配时不爬 fail。** 漏报"后缀也是模式"的情况（如 she 中的 he）。
3. **失配直接回根。** 丢信息，应沿 fail。回根只用于 fail 已到根。
4. **重叠与最左最长不做策略。** AC 默认报所有出现；业务替换/拦截需要覆盖区间贪心或优先长词。
5. **Unicode/规范化疏忽。** 大小写、全半角、变体字、emoji 可绕过；先 NFKC + lower 再匹配；注意字素簇切分。

## 七、与开源书/权威来源对应

1. Aho A. V., Corasick M. J. "Efficient String Matching: An Aid to Bibliographic Search", CACM 1975。
2. cp-algorithms: "Aho-Corasick Algorithm"；OI-wiki「AC 自动机」。
3. darts-clone / cedar：把 AC 转移表压成双数组的工程库。
4. Intel Hyperscan 技术文档：SIMD 多模式匹配的工业实践。

## 八、面试题

1. **海量敏感词如何一次过滤？**  
   参考答案：AC 自动机建 Trie+fail，单次 $O(n)$；命中后按最长优先覆盖替换；上线前做规范化与变体收敛。

2. **fail 与 KMP next 的关系？**  
   参考答案：fail 是 Trie 上的"最长真后缀前缀"跳转，单模式链上退化为 KMP $\pi$。

3. **如何做到最左最长、不重复命中？**  
   参考答案：收集所有 (end, word) 后按结束位置升序、长度降序贪心覆盖（见 `filter_text`）；或只在 fail 链最长匹配处输出。

4. **词表百万、内存或延迟不达标怎么办？**  
   参考答案：双数组/压缩 Trie 存转移；fail 输出链压缩；分片 + 边界重叠；热门规则缓存；必要时上 Hyperscan。

## 九、演进与趋势

AC 的演进在**内存压缩、增量更新与硬件加速**。双数组 AC（darts）把转移与 fail 压进数组，服务端 mmap 热更新；增量/动态 AC 支持词表在线变更（局部重建 fail）。SIMD/GPU 实现把扫描吞吐推到数 GB/s，用于 DPI 与 DLP。研究热点包括：带编辑距离的模糊 AC（对称删除、自动机并行）、带正则扩展的 AC、以及隐私保护扫描（不可见词表）。面试趋势：结合系统设计（词表热更、降级、指标）多于纯算法默写；但 fail 与输出合并仍是必过基础。

## 十、小结

AC 自动机是"基于 Trie 的多模式匹配"标准答案：Trie 共享前缀，fail 指针（树形 KMP）保证失配后不漏，输出合并保证一次报告所有命中，总代价 $O(M+n+\mathrm{occ})$。从敏感词到 IDS，从分词到生物探针，它是把多模式问题从 $O(kn)$ 降到线性的关键结构。掌握 Trie + fail + 输出链三层，就能设计出正确且可工程化的匹配引擎。
