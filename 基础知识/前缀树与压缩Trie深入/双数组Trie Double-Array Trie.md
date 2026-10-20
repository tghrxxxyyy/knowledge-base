# 双数组Trie Double-Array Trie

> 对应 Aoe (1989) "An Efficient Implementation of Static Search Trees"（双数组 Trie 的经典出处）；以及后续 Morita、Yata 等对紧凑实现（cedar、Darts）的工程改进。

## 一、背景与挑战

标准 Trie 用指针/哈希表存子节点，灵活但代价高：每节点一次堆分配、指针追踪导致 cache miss、哈希出边还有额外桶开销。对**百万级静态词库**（输入法词典、敏感词库、分词器、拼写检查、路由前缀表），内存与延迟都成问题。我们真正需要的是：插入少、查询极多、词库基本只读的场景里，得到**接近数组下标访问**的速度与**连续内存**的布局。

双数组 Trie（Double-Array Trie, DAT）把 Trie 的状态转移编码成两个整型数组：

- `base[s]`：状态 $s$ 的基址；
- `check[s]`：占用 `check[s]==s`（或父状态）的校验，用于确认 `base` 寻址没有"撞车"。

转移函数为

$$
\mathrm{next}(s, c) = \mathrm{base}[s] + \mathrm{code}(c),
$$

若 `check[next] == s` 则转移合法。这样一次查询就是两次数组读 + 一次比较，无指针、无哈希，缓存友好，可轻松压进 CPU cache；对二进制/小字符集（分词 ID、英文小写、Unicode 码点映射后的整数）尤其合适。

工程与面试中，DAT 是"大词库高性能匹配"的经典答案：输入法引擎、Aho–Corasick 的转移表压缩（`cedar`、`darts-clone`）、Linux 某些模块、日志敏感词过滤。面试常问：双数组的 `base`/`check` 含义、如何插入（找空槽）、冲突怎么办、与哈希/普通 Trie 对比。理解"用数组模拟转移 + check 验证"的编码思想，是把 Trie 从"指针树"变成"扁平状态机"的关键一步。

## 二、核心原理

**状态与转移。** Trie 的每个节点是一个状态 $s$（用整数编号，根为 `BASE_ROOT`，如 0 或 1）。字符 $c$ 映射到码 `code(c) ∈ [1, Σ]`。若有边 $s \xrightarrow{c} t$，则必须满足

$$
\mathrm{base}[s] + \mathrm{code}(c) = t,\quad \mathrm{check}[t] = s.
$$

`check[t]==s` 保证 $t$ 不是被其他父节点"偶然撞上"的槽；若 `check[t]` 是空槽标记（如 -1 或 0）或不等于 $s$，则该转移不存在。

**插入（找 base）。** 为节点 $s$ 的所有出边字符集合 $C_s$ 分配一个基址 $b$，使得对每个 $c \in C_s$，槽 $b + \mathrm{code}(c)$ 都空闲（或可接受）。把 `base[s]=b`，并把 `check[b+code(c)]` 置 $s$，子状态编号即 $b+\mathrm{code}(c)$（或另行分配再映射，实现风格不同）。找 $b$ 可以从上次成功位置顺序扫（增量法），或维护空闲链。

**查询。** 从根 $s_0$ 开始，对键每个字符 $c$：

$$
t = \mathrm{base}[s] + \mathrm{code}(c);
\quad \text{若 } \mathrm{check}[t] == s \text{ 则 } s = t \text{ 否则失败}.
$$

查询结束看 $s$ 是否为词尾状态（用额外 `leaf/val` 数组或在 `base` 负值等技巧编码）。

**AC 自动机的 DAT 化。** 把 AC 的 `next` 表也编成双数组，fail 指针单独数组，可把多模式匹配的内存压到极低，查询保持 $O(n)$。`darts-clone`、`cedar` 就是这条路线。

**不变量**：
1. 合法转移 $(s,c)\to t$ 必有 `base[s]+code(c)=t` 且 `check[t]=s`；
2. 不同状态的出边槽不冲突（或冲突时被 check 拒绝）；
3. 数组可序列化：构建完 dump 成二进制，运行时 mmap 只读，适合服务端热更新。

**优点**：查询常数极小、内存比指针 Trie 省数倍、可 mmap。  
**缺点**：插入/删除复杂（要找槽、可能搬迁），通常离线构建后只读；`base` 选择不当会碎片、空间浪费，需要装填因子优化。

## 三、形式化与数学基础

设字符码域 $[1,\sigma]$，状态数 $n$，转移数 $e$。理想情况下数组长度 $A \approx e + n$；因对齐与冲突，实际 $A = \Theta(e + \text{碎片})$，装填率 $\rho = e / A$。好的 `base` 启发式（顺序 first-fit、按出度排序、嵌入空间管理）可把 $\rho$ 提到 0.5–0.8。

**查询复杂度。** 每字符 $O(1)$（两次数组读 + 比较），整键 $O(m)$；比哈希少一次哈希计算，比指针 Trie 少指针追踪。实验上常快 2–5 倍。

**空间对比。** 指针 Trie：每节点 `dict` 或指针数组，英文 26 可能 $O(26n)$ 槽 + 对象头；DAT：两数组 $O(A)$ 整型，加上可选 `val`。对 $10^6$ 词、平均 8 字符，DAT 常在几 MB 到十几 MB，而对象 Trie 可能数十 MB。

**正确性。** 归纳：根正确；若 $s$ 表示前缀 $p$ 且 check 不变量成立，则沿 $c$ 到 $t$ 当且仅当 $pc$ 是某键前缀。碰撞被 check 过滤，故不会假阳。词尾需单独标记（`val[t]` 或 `leaf` 位），否则把前缀当词。

**增量插入的均摊。** 顺序扫描空闲槽，均摊 $O(\sigma)$ 找 base；总构建 $O(e\sigma)$ 或更好（用链式空闲表 $O(e)$）。删除可用 `check` 置空并回收槽，但易碎片，常重建。

## 四、代码实现

```python
class DoubleArrayTrie:
    """简化版双数组 Trie：先建逻辑 Trie，build() 编码为 base/check，search 走数组。"""

    def __init__(self):
        # 逻辑 Trie（下标 0 不用；状态 1 为根）
        self._ch: list[dict[int, int]] = [{}]
        self._val: list = [None]
        self._new_node()  # -> 状态 1
        self.base: list[int] = [0]
        self.check: list[int] = [0]
        self._endval: dict[int, object] = {}

    def _new_node(self) -> int:
        self._ch.append({})
        self._val.append(None)
        return len(self._ch) - 1

    @staticmethod
    def _code(ch: str) -> int:
        return ord(ch) + 1  # 从 1 开始，避免与空槽 0 混淆

    def insert(self, word: str, value=True) -> None:
        s = 1
        for ch in word:
            c = self._code(ch)
            if c not in self._ch[s]:
                self._ch[s][c] = self._new_node()
            s = self._ch[s][c]
        self._val[s] = value

    def _find_base(self, codes: list[int]) -> int:
        """找最小 b，使所有 b+code 槽位空闲。"""
        if not codes:
            return 1
        b = 1
        maxc = max(codes)
        while True:
            need = b + maxc + 1
            if need > len(self.check):
                ext = need - len(self.check) + 16
                self.base.extend([0] * ext)
                self.check.extend([-1] * ext)
            ok = True
            for c in codes:
                if self.check[b + c] != -1:
                    ok = False
                    b = b + c + 1
                    break
            if ok:
                return b

    def build(self) -> None:
        """把逻辑 Trie 编码进 base/check：转移 t = base[s] + code，check[t] == s 才合法。"""
        self.base = [0]
        self.check = [0]
        self._endval = {}
        dat = [0] * len(self._ch)  # 逻辑状态 -> 数组下标
        # 根固定占下标 1
        dat[1] = 1
        self.check.append(0)   # 下标 1 的 check 置 0，防止子节点撞上根
        self.base.append(0)

        from collections import deque
        q = deque([1])
        while q:
            logical = q.popleft()
            s = dat[logical]
            codes = list(self._ch[logical].keys())
            if codes:
                b = self._find_base(codes)
                self.base[s] = b
                for c, child in self._ch[logical].items():
                    t = b + c
                    self.check[t] = s
                    dat[child] = t
                    q.append(child)
            if self._val[logical] is not None:
                self._endval[s] = self._val[logical]

    def search(self, word: str):
        s = 1
        for ch in word:
            c = self._code(ch)
            t = self.base[s] + c
            if t >= len(self.check) or self.check[t] != s:
                return None
            s = t
        return self._endval.get(s)


if __name__ == "__main__":
    dat = DoubleArrayTrie()
    words = ["cat", "car", "dog", "cab", "do"]
    for w in words:
        dat.insert(w, value=w)
    dat.build()
    for w in words:
        assert dat.search(w) == w, w
    assert dat.search("ca") is None
    assert dat.search("dogs") is None
    assert dat.search("c") is None
    dat.insert("caboodle", value="caboodle")
    dat.build()
    assert dat.search("caboodle") == "caboodle"
    assert dat.search("cab") == "cab"
    print("DAT ok")
```

> 说明：以上为**教学简化版**——逻辑结构用邻接表维护，`build()` 一次性编码为 `base`/`check`。生产级 DAT（darts、cedar）支持在线增量插入、空闲链、按出度排序插入、位图压缩与 `leaf/sibling` 编码，细节更复杂但编码思想一致。

## 五、与其他技术对比

| 结构 | 查询 | 构建 | 删除 | 内存 | 部署 |
|------|------|------|------|------|------|
| 哈希表 | $O(m)$ 期望 | $O(m)$ | 易 | 中 | 通用 |
| 指针 Trie | $O(m)$ | $O(m)$ | 易 | 大 | 动态词典 |
| Radix Tree | $O(m)$ | $O(m)$ | 中 | 小 | 动态前缀 |
| 双数组 Trie | $O(m)$ 常数最小 | $O(e\sigma)$ 离线 | 难 | 最小之一 | 静态大词库 mmap |
| FST/DAWG | $O(m)$ | 较复杂 | 难 | 极小 | 词典压缩 |

**取舍**：只读/低频更新的大词库 + 极致查询延迟 → DAT；频繁增删 → 指针/Radix；需要最小空间的静态词典 → FST/DAT。

## 六、常见误区

1. **忘记 `check` 校验。** 只用 `base[s]+c` 会把"槽被别的状态占用"误判为合法转移，产生假匹配。必须 `check[t]==s`。
2. **词尾状态不标记。** `search("ca")` 在只存 `car` 时不能为真；要 `value/leaf` 数组。
3. **字符码未规范化 / 码为 0。** code 应从 1 开始，0 与空槽语义冲突；大小写、Unicode 要统一。
4. **在线插入不做迁移或不查冲突。** 教学实现简化后才可过用例；生产若直接顺序写槽，碰撞会破坏已有词。
5. **认为 DAT 支持高效删除与海量随机插入。** 它是为静态/批量构建设计的；动态场景请换 Radix/哈希。

## 七、与开源书/权威来源对应

1. Aoe J. "An Efficient Implementation of Static Search Trees", Acta Informatica / 相关期刊 1989。双数组 Trie 奠基。
2. darts-clone（GitHub: y-256/libdarts）与 cedar（GitHub: ytakahashi/cedar）——工业级 DAT/紧凑 Trie 库。
3. Morita K. et al. 关于 double-array 的装填与更新改进（IEICE 论文）。
4. 《算法竞赛进阶指南》/ OI-wiki「双数组 Trie」；以及输入法引擎技术博客（如 Google Japanese Input 的词典层）。

## 八、面试题

1. **双数组的 `base` 与 `check` 各是什么？**  
   参考答案：转移 $t=\mathrm{base}[s]+\mathrm{code}(c)$；`check[t]==s` 才算合法。`base` 是每个状态的基址，`check` 防止槽冲突误判。

2. **为什么 DAT 查询比哈希/指针 Trie 快？**  
   参考答案：无指针间接、无哈希计算，两次数组访问 + 比较，缓存局部性好；适合只读大词库。

3. **如何构建百万词库的 DAT？**  
   参考答案：离线批量插入（按出度排序或 first-fit 空闲链），控制装填率；构建后序列化，运行时 mmap 只读。

4. **DAT 做 AC 自动机可行吗？**  
   参考答案：可以。把 AC 的 next 表编码为双数组，fail 另存；`darts-clone`/`cedar` 即支持多模式压缩匹配。

## 九、演进与趋势

DAT 的演进在**压缩、并行构建与动态性**。位图 + 稀疏数组（double-array 的稀疏编码）进一步省内存；`cedar` 的 nested block、LOUDS 编码与 FST 竞争静态词典极致压缩。并行构建（多线程分段插槽）加速超大词库。部分工作尝试"双数组 + 增量更新"（chunked DAT），用于在线词典。在输入法、分词、敏感词、DNA k-mer 索引中 DAT 仍活跃。面试趋势：能讲清 check 机制、静态部署与 mmap、和 FST/哈希的取舍即可；手写完整 DAT 较少，但读懂简化实现是基本功。

## 十、小结

双数组 Trie 用 `base[s]+code(c)` 与 `check[t]==s` 把 Trie 转移压成两个整型数组，查询接近裸数组访问，内存远小于指针树，适合只读大词库。它的代价是构建与更新复杂，故多离线生成、运行时 mmap。理解 DAT，就理解了"状态机扁平化"这一工程手法，也是通往 AC 压缩、FST 与高性能词典的必经之路。
