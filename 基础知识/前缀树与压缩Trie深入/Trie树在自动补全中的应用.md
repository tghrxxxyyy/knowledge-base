# Trie树在自动补全中的应用

> 对应 Sedgewick《Algorithms》Tries 章节中的补全用例；以及搜索引擎 suggest（如 Google Autocomplete）、IDE 语言服务中的前缀索引实践；可参考 Brin & Page 关于检索系统的背景与现代 completion service 设计。

## 一、背景与挑战

自动补全（autocomplete / typeahead）是用户输入前缀、系统实时给出候选词的功能：搜索框里敲 `app` 弹出 `apple`、`application`；IDE 里敲 `str.` 弹出方法列表；命令行按 Tab 补全子命令；输入法把 `nihao` 变成"你好"候选。它有三个硬要求：

1. **低延迟**：用户每敲一个字符（50–100ms 内）就要新结果，不能扫全库；
2. **前缀语义**：结果必须以已输入前缀开头（或满足业务定义的模糊语义）；
3. **排序质量**：不是列出全部匹配，而是按热度/相关性 Top-K，且随输入不断重排。

朴素做法每次全表扫描 $O(N)$ 过滤前缀，词库到十万级延迟就不可接受；哈希表只能精确查找，无法枚举前缀子集；数据库 `LIKE 'app%'` 在索引不当或规则复杂时退化，且排序/分页在内存索引下更自然。**Trie（前缀树）把"前缀过滤"变成 $O(|p|)$ 定位 + $O(k)$ 枚举**，与库大小几乎解耦，是补全索引的经典选择。

工程与面试中，"设计一个搜索补全 / 命令补全服务"是高频系统设计题。候选人要能说出：索引结构（Trie/Radix/倒排）、排序因子（词频、个性化、时效）、Top-K 怎么取（子树堆 vs 全量排序）、缓存、多副本与预热。实现题则常要求"实现一个 Trie 支持 insert 与 suggest(prefix, k)"。理解"前缀定位 + 子树候选 + 排序剪枝"这条链路，是本主题的核心。

## 二、核心原理

**索引层：Trie 存词表。** 每个词插入 Trie，结尾节点挂载**词频/权重**（以及可选的 ID、类型、语言等元数据）。补全查询 `suggest("app", k)`：

1. 沿 `app` 走到节点 $u$；
2. 在 $u$ 的子树中找权重最大的 $k$ 个结尾词；
3. 返回给 UI，随用户继续输入前缀加长，重新查询（结果集单调收缩）。

**排序层：子树 Top-K。** 最笨是 DFS 全子树再排序 $O(S)$（$S$ 为子树大小），大前缀（如 `a`）子树巨大。优化：

- **节点维护聚合堆**：每个节点存"子树内 Top-K 词"的堆/有序列表，插入/更新时沿路径上浮合并。查询 $O(|p|+k)$，但更新贵，适合静态或准静态词库。
- **带权重的 DFS + 剪枝**：按权重优先扩展（优先队列），只要 Top-K，不必遍历全部。期望快，最坏仍 $O(S)$。
- **离线预计算热门前缀**：对访问日志中的高频前缀缓存结果，命中后直接返回。

**增量与更新。** 词频实时变化（热搜、个性化）时，纯静态堆会过时。工程常见折中：全局 Trie 用批量重建（分钟级），个性化信号用"全局 Top-K 重排"（业务层过滤后按用户画像打分），避免把个性化写进共享 Trie。

**多约束。** 真实补全还有过滤：去敏感词、按语言/类型过滤（IDE 里只补方法不补变量）、模糊容忍（编辑距离 1，见 BK-tree/对称删除）。Trie 通常做"精确前缀召回"，模糊层在其外。

**边界条件**：
- 前缀本身是完整词（`app` 既是词又是前缀），要决定是否把自己列入候选；
- 多音字/同形词（IME）要返回多个候选；
- 输入为空时的"热门建议"；
- 大小写、拼音、简繁体归一。

## 三、形式化与数学基础

设词库 $K$，权重 $w: K \to \mathbb{R}^+$，查询前缀 $p$，要求

$$
\mathrm{TopK}(p) = \arg\max_{S \subseteq \mathrm{PrefMatch}(p),\, |S|=k} \sum_{x \in S} w(x).
$$

**Trie + 堆的复杂度。** 预处理：插入 $O(\sum|w|)$，若每节点维护 Top-K 堆，合并代价均摊 $O(k)$ 每路径更新。查询 $O(|p| + k \log k)$ 或 $O(|p| + k)$（若堆有序）。

**剪枝正确性。** 带权 DFS 时维护当前第 $k$ 大阈值 $\theta$；若某子树的上界（预计算的最大权重）$\le \theta$，可整枝剪掉。若节点存 `subtree_max_w`，保证不漏最优。

**命中率与延迟。** 对 Zipf 分布词频，前 $m$ 个词占访问的大部分；缓存热门前缀可让 P99 延迟从几十毫秒降到几毫秒。设缓存命中率 $h$，平均延迟 $L = h L_c + (1-h) L_{\text{trie}}$。

**与倒排/排序索引对比。** 前缀查询本质是 `key >= p AND key < p+1` 的范围查询；B+ 树/跳表也能做，$O(\log N + k)$，且对范围排序友好。Trie 的优势是通配、LPM 与字符级灵活性；B+ 树优势是磁盘友好与缓存。现代引擎常两者混用或用 FST。

## 四、代码实现

```python
import heapq


class ACNode:
    __slots__ = ("children", "word", "weight", "topk")

    def __init__(self):
        self.children: dict[str, "ACNode"] = {}
        self.word: str | None = None
        self.weight = 0
        self.topk: list[tuple[int, str]] = []  # 子树 Top-K（最大堆用负权重）


class AutocompleteTrie:
    """带 Top-K 的补全 Trie：插入时维护路径上的 topk 列表。"""

    def __init__(self, k: int = 10):
        self.root = ACNode()
        self.k = k

    def insert(self, word: str, weight: int = 1) -> None:
        path = [self.root]
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, ACNode())
            path.append(node)
        node.word = word
        node.weight = weight
        # 自底向上更新 Top-K
        for u in reversed(path):
            self._refresh(u)

    def _refresh(self, u: ACNode) -> None:
        items: list[tuple[int, str]] = []
        if u.word is not None:
            items.append((u.weight, u.word))
        for v in u.children.values():
            items.extend(v.topk)
        items.sort(key=lambda x: (-x[0], x[1]))
        u.topk = items[: self.k]

    def suggest(self, prefix: str) -> list[tuple[str, int]]:
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return []
            node = node.children[ch]
        # 排除"等于前缀的词"以外是否包含前缀本身，由业务定；这里保留
        return [(w, wt) for wt, w in node.topk]


if __name__ == "__main__":
    ac = AutocompleteTrie(k=3)
    ac.insert("app", 5)
    ac.insert("apple", 100)
    ac.insert("application", 80)
    ac.insert("apply", 70)
    ac.insert("banana", 90)
    assert [w for w, _ in ac.suggest("app")] == ["apple", "application", "apply"]
    assert [w for w, _ in ac.suggest("appl")] == ["apple", "application", "apply"]
    assert ac.suggest("x") == []
    ac.insert("appstore", 200)
    assert ac.suggest("app")[0][0] == "appstore"
    print("Autocomplete ok")
```

## 五、与其他技术对比

| 方案 | 查询延迟 | 更新 | 排序能力 | 适用 |
|------|----------|------|----------|------|
| 全表扫描 | $O(N)$ | 易 | 易 | 玩具 |
| SQL `LIKE` | 索引相关 | 易 | 可 | 小数据/后台 |
| Trie + 子树堆 | $O(m+k)$ | 较难 | Top-K 自然 | 词典/命令补全 |
| B+ 树范围 | $O(\log N+k)$ | 易 | 有序好 | 磁盘/数据库 |
| 倒排 + 前缀词典 | 视实现 | 易 | 好 | 搜索引擎 suggest |
| 向量召回 + 重排 | 召回快 | 易 | 语义 | LLM/模糊补全 |

**取舍**：字面前缀 + 高 QPS + 准静态词库 → Trie/压缩 Trie + 缓存；强语义（"缩写、错拼、同义"）→ 向量混合；持久化与范围 → B+ 树/FST。

## 六、常见误区

1. **每次补全都 DFS 整棵子树再排序。** 前缀很短时子树巨大，延迟爆炸。必须预计算堆或剪枝。
2. **把个性化写进共享 Trie。** 更新冲突、内存膨胀、缓存失效。个性化应在召回后重排。
3. **忽略"前缀本身是否为词"与重复词。** UI 上要稳定排序（同权重按字典序），避免闪烁。
4. **不做归一化。** 大小写、全半角、拼音、简繁不一致导致"明明有词却补不出来"。
5. **Top-K 堆只增不减。** 删除或降权后堆里残留旧词，需要重建或打标失效。

## 七、与开源书/权威来源对应

1. Sedgewick & Wayne《Algorithms》第 5 章 Tries（autocomplete 用例）。
2. Google Search Autocomplete / Bing Suggestions 的公开技术分享（prefix-based typeahead architecture）。
3. Lucene/Elasticsearch Completion Suggester 与 FST 文档——工业级补全索引。
4. IDE 语言服务（LSP）补全协议与实现（如 clangd / rust-analyzer 的前缀过滤）。

## 八、面试题

1. **实现 `suggest(prefix, k)`，要求延迟与词库大小弱相关。**  
   参考答案：Trie 插入时维护节点 Top-K；查询 $O(|p|+k)$。或带权 DFS + `subtree_max` 剪枝。见代码。

2. **词频实时变化怎么处理？**  
   参考答案：准静态批量重建 Trie（分钟级）+ 变更日志重放；或全局候选召回后按实时分数重排。不要在热路径逐次重建堆。

3. **如何支持"前缀 + 模糊（编辑距离 1）"补全？**  
   参考答案：对称删除（symmetric delete）预生成变体；或 Trie 上 DFS 限定错误预算；或向量召回。注意别对每个错误都全库扫。

4. **设计一个千万级命令/词库的补全服务。**  
   参考答案：压缩 Trie/DAT 分片，热门前缀缓存，P99 SLO 监控，冷启动预热；更新走版本化全量替换；降级为静态热门词。

## 九、演进与趋势

补全正在从"字面前缀"走向"语义 + 约束"。LLM 时代的产品（IDE copilot、搜索框）常用混合检索：向量召回语义候选，再用前缀/语法约束过滤，最后按个性化与点击模型重排。Trie 仍是**硬约束层**（必须以 `app` 开头、必须是合法标识符）的高效执行者。网络与终端场景（shell、kubectl）补全与权限、上下文感知结合。研究方向包括：个性化联邦补全、隐私保护（不泄露用户前缀）、多语言联合索引。面试趋势是系统设计题多于纯实现题：候选人应能讨论索引更新一致性、缓存失效、冷热分层与观测指标（命中率、建议接受率）。

## 十、小结

自动补全把 Trie 的前缀定位能力与排序/缓存工程结合起来：$O(|p|)$ 定位候选子树，Top-K 堆或剪枝取结果，业务层做归一、过滤与重排。它是 Trie 最广为人知的应用，也是检验"数据结构 + 系统设计"综合能力的经典场景。记住：结构解决召回，工程解决延迟与质量。
