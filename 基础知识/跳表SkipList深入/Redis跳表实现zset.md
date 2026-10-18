# Redis跳表实现zset

> 对应 Redis 源码 `t_zset.c` / `server.h` 中的 `zskiplist` 实现，以及 CyC2018/CS-Notes 对 Redis 数据结构的解读。

## 一、背景与挑战

Redis 的 `zset`（有序集合）同时提出了四种查询需求：按 member **精确取 score**（`ZSCORE`）、按 score **范围扫描**（`ZRANGEBYSCORE`）、按 **排名** 取元素（`ZRANK`/`ZRANGE`）、按 member **字典序范围**（`ZRANGEBYLEX`，仅当 score 全相等时有意义）。单纯用哈希表做不到有序；单纯用红黑树或跳表做不到 $O(1)$ 查 score；只用跳表做 rank，若不额外记账就要沿链表数一遍，变成 $O(n)$。

于是 Redis 采用「**跳表 + 哈希表**」双结构：哈希表 `dict` 从 member 映射到 score，满足 `ZSCORE` 的 $O(1)$；跳表 `zskiplist` 以 **(score, member)** 为全序关键字，支撑范围、排名、插入删除。跳表每个结点的每层还保存 **span**（该层指针跨越的底层结点数），使得 `ZRANK` 只需沿查找路径累加 span，达到 $O(\log n)$。

工程挑战还有内存。zset 常存百万级元素（排行榜、时间线、限流桶），但也有大量「只存几十个成员」的小集合。Redis 因此做了**编码转换**：元素少且短时用紧凑的 `listpack`（旧版为 `ziplist`），超过阈值才升级为跳表+哈希。理解 Redis zset，就是理解「如何在一个数据结构上同时满足有序、排名、精确查、内存敏感」这组互相拉扯的需求。

面试中「为什么 zset 用跳表不用红黑树」几乎是必考；能进一步讲清 span 与双结构分工，才算真懂 Redis 的取舍。

## 二、核心原理

### 2.1 双结构分工

- `dict`：`member -> score`。`ZSCORE`、判断成员是否存在、`ZADD` 更新分值前查旧值，都是 $O(1)$。
- `zskiplist`：结点按 `(score, member)` 有序。score 不同时比 score；score 相同时比 member 字典序。这样任意两个元素都全序，跳表不会出现「比较相等却不是同一元素」的歧义。

`ZADD` 流程：先在 dict 查该 member 是否存在。若存在且分值不变，直接返回；若存在且要改分值，必须**先从跳表删旧结点、再按新 score 插入**（跳表不允许原地改关键字）；若不存在，则 dict 与跳表各插入一次。`ZREM` 则两边都删。这个「关键字含 score」的事实，是很多实现细节的根源。

### 2.2 跳表结点与 span

`zskiplistNode` 的关键字段：

- `ele`：member（sds 字符串）。
- `score`：double。
- `backward`：底层后退指针，支持 `ZREVRANGE` 反向遍历。
- `level[]`：每层含 `forward`（后继）与 `span`（跨越的底层结点数）。

span 的不变量：在第 $l$ 层，从结点 $x$ 沿 `forward` 到 $y$，则 `x.level[l].span` 表示底层链表上从 $x$（不含）到 $y$（不含）之间的结点个数所对应的「排名跨度」。查找时把路径上真正跨过的 span 累加，就得到「小于目标的元素个数」，即 0-based 排名。

`ZRANK` 算法与普通查找相同，只是在高层向右走时累加 `span[i]`，下降时把当前结点位置对应的偏移继续带下去。复杂度仍是 $O(\log n)$。

### 2.3 层数概率与上限

Redis `zslRandomLevel` 以 $p = 1/4$（`ZSKIPLIST_P = 0.25`）晋升，`ZSKIPLIST_MAXLEVEL = 32`。$p = 1/4$ 使层数更少、每层横向跨度更大，比较次数与缓存缺失都更友好；32 层足以覆盖实际元素规模（$4^{32}$ 远大于内存能放下的 zset）。

### 2.4 编码转换

`zset-max-listpack-entries`（默认 128）与 `zset-max-listpack-value`（默认 64 字节）决定底层编码。小集合整块连续内存、遍历极快、无指针开销；超过阈值转跳表+哈希，用一点内存换对数操作。这是「按规模分档」的典型工程手法。

## 三、形式化与数学基础

复杂度一览（$n$ 为元素数，$k$ 为返回个数）：

| 命令 | 主要结构 | 复杂度 |
|------|----------|--------|
| `ZSCORE` | dict | $O(1)$ |
| `ZADD` 新成员 | dict + skiplist | $O(\log n)$ |
| `ZADD` 更新分值 | 删旧 + 插新 | $O(\log n)$ |
| `ZREM` | dict + skiplist | $O(\log n)$ |
| `ZRANK` | skiplist + span | $O(\log n)$ |
| `ZRANGE` | skiplist | $O(\log n + k)$ |
| `ZRANGEBYSCORE` | skiplist | $O(\log n + k)$ |
| `ZCOUNT` | skiplist 两次定位 | $O(\log n)$ |

**span 排名正确性**：设查找路径依次跨越结点 $x_1, x_2, \ldots$，每一步在第 $i$ 层加上的 `span[i]` 恰好是该指针覆盖的底层区间长度。高层区间互不相交且并集为「从 head 到目标前驱」的全部底层结点，故累加和等于「小于目标的个数」。

**空间**：哈希表 $O(n)$；跳表每结点期望层数

$$E[L] = \sum_{l \ge 0} p^l = \frac{1}{1-p} = \frac{1}{1-0.25} = \frac{4}{3},$$

外加每层 8 字节 span 与 score/member。zset 总体 $O(n)$，常数高于纯哈希，但换来有序与排名。

**$p = 1/4$ 的查找期望**：层数期望 $\log_{4} n$，每层期望横向步数 $O\!\left(\frac{1}{1-p}\right) = O(4/3)$，总期望 $O(\log_4 n)$，比 $p = 1/2$ 层更少、单层跳更远。

## 四、代码实现

下面实现一个可运行的「迷你 Redis zset」：跳表（含 span）+ 字典，支持 add / score / rank / range_by_rank / remove，语义对齐 `ZADD/ZSCORE/ZRANK/ZRANGE/ZREM`。

```python
import random


class ZNode:
    __slots__ = ("member", "score", "forward", "span")
    def __init__(self, member, score, level):
        self.member = member
        self.score = score
        self.forward = [None] * (level + 1)
        self.span = [0] * (level + 1)


class MiniZSet:
    """跳表 + 哈希：score 相同时按 member 字典序，与 Redis zset 一致。"""

    def __init__(self, p=0.25, max_level=32):
        self.p = p
        self.max_level = max_level
        self.head = ZNode(None, 0.0, max_level)
        self.level = 0
        self.dict = {}
        self.n = 0

    def _random_level(self):
        lvl = 0
        while random.random() < self.p and lvl < self.max_level:
            lvl += 1
        return lvl

    def _find(self, score, member):
        """查找 (score, member) 的插入位置。

        返回 update[]（每层前驱）与 rank[]（从 head 到该前驱的底层跨度累计）。
        """
        update = [None] * (self.max_level + 1)
        rank = [0] * (self.max_level + 1)
        cur = self.head
        for i in range(self.level, -1, -1):
            rank[i] = rank[i + 1] if i < self.level else 0
            while cur.forward[i]:
                nxt = cur.forward[i]
                if nxt.score < score or (nxt.score == score and nxt.member < member):
                    rank[i] += cur.span[i]
                    cur = nxt
                else:
                    break
            update[i] = cur
        return update, rank

    def add(self, member, score):
        if member in self.dict:
            if self.dict[member] == score:
                return False
            self.remove(member)  # 关键字含 score，必须删旧插新
        update, rank = self._find(score, member)
        lvl = self._random_level()
        if lvl > self.level:
            for i in range(self.level + 1, lvl + 1):
                update[i] = self.head
                rank[i] = self.n
                self.head.span[i] = self.n
            self.level = lvl
        node = ZNode(member, score, lvl)
        for i in range(lvl + 1):
            node.forward[i] = update[i].forward[i]
            update[i].forward[i] = node
            # 与 Redis zslInsert 相同的 span 差分：
            # 从 update[i] 到 node 的跨度 = rank[0] - rank[i] + 1 的前缀关系
            node.span[i] = update[i].span[i] - (rank[0] - rank[i])
            update[i].span[i] = rank[0] - rank[i] + 1
        for i in range(lvl + 1, self.level + 1):
            update[i].span[i] += 1
        self.dict[member] = score
        self.n += 1
        return True

    def remove(self, member):
        if member not in self.dict:
            return False
        score = self.dict[member]
        update, _ = self._find(score, member)
        target = update[0].forward[0]
        if target is None or target.member != member:
            # 结构与 dict 不一致时兜底，正常路径不会走到
            del self.dict[member]
            self.n -= 1
            return True
        for i in range(self.level + 1):
            if update[i].forward[i] is target:
                update[i].span[i] += target.span[i] - 1
                update[i].forward[i] = target.forward[i]
            else:
                update[i].span[i] -= 1
        while self.level > 0 and self.head.forward[self.level] is None:
            self.level -= 1
        del self.dict[member]
        self.n -= 1
        return True

    def score(self, member):
        return self.dict.get(member)

    def rank(self, member):
        """0-based 排名；不存在返回 None。"""
        if member not in self.dict:
            return None
        score = self.dict[member]
        cur = self.head
        r = 0
        for i in range(self.level, -1, -1):
            while cur.forward[i]:
                nxt = cur.forward[i]
                if nxt.score < score or (nxt.score == score and nxt.member < member):
                    r += cur.span[i]
                    cur = nxt
                else:
                    break
        return r

    def range_by_rank(self, start, stop):
        """返回 [start, stop] 区间内的 (member, score)，0-based。"""
        out = []
        cur = self.head.forward[0]
        i = 0
        while cur and i <= stop:
            if i >= start:
                out.append((cur.member, cur.score))
            cur = cur.forward[0]
            i += 1
        return out


if __name__ == "__main__":
    z = MiniZSet()
    z.add("alice", 10.0)
    z.add("bob", 20.0)
    z.add("carol", 15.0)
    assert z.score("bob") == 20.0
    assert z.rank("alice") == 0
    assert z.rank("carol") == 1
    assert z.rank("bob") == 2
    assert z.range_by_rank(0, 2) == [
        ("alice", 10.0), ("carol", 15.0), ("bob", 20.0)
    ]

    z.add("alice", 25.0)          # 更新分值：alice 变为最大
    assert z.rank("alice") == 2
    assert z.n == 3

    assert z.remove("carol") is True
    assert z.rank("alice") == 1
    assert z.remove("nobody") is False

    # 随机用例：与排序结果对拍
    z2 = MiniZSet()
    items = [(f"m{i}", float(i % 50)) for i in range(100)]
    random.shuffle(items)
    for m, s in items:
        z2.add(m, s)
    expect = sorted(items, key=lambda x: (x[1], x[0]))
    got = z2.range_by_rank(0, 99)
    assert got == expect
    for m, s in expect:
        assert z2.rank(m) == expect.index((m, s))
        assert z2.score(m) == s
    print("mini zset ok, n =", z2.n)
```

span 差分公式与 Redis `zslInsert` 一致：插入点前驱在第 $i$ 层的跨度被拆成「到新结点」和「到原后继」两段；更高层（新结点未达到的层）只需把跨度加 1。删除时对称地「并回」跨度。这套增量维护是 `ZRANK` 能保持 $O(\log n)$ 的关键。

## 五、与其他技术对比

| 方案 | 查 score | 范围 | rank | 内存 | 实现复杂度 |
|------|----------|------|------|------|------------|
| 纯哈希 | $O(1)$ | 否 | 否 | 省 | 低 |
| 纯跳表 | $O(\log n)$ | 是 | 需 span | 中 | 中 |
| 红黑树 + 哈希 | $O(1)$ | 是 | 需 size 域 | 中 | 高 |
| 跳表 + 哈希（Redis） | $O(1)$ | 是 | $O(\log n)$ | 中 | 中 |
| listpack 小集合 | $O(n)$（$n$ 小） | 是 | 是 | 极省 | 低 |

Redis 选跳表+哈希而非红黑树+哈希：范围扫描与排名在跳表上更自然（底层链表 + span）；实现与审计远简单于红黑树；结点独立分配，并发与内存碎片更友好。红黑树的确定性最坏界对 Redis 这种平均吞吐优先的场景吸引力有限。

## 六、常见误区

**误区一：以为 zset 只有跳表。** 忽略 dict 就无法解释 `ZSCORE` 为何 $O(1)$，也解释不了更新分值为何要「删旧插新」。

**误区二：比较函数只比 score。** 两个不同 member 同 score 会被当成同一关键字，插入删除语义错乱。必须 `(score, member)` 全序。

**误区三：以为 `ZRANK` 要线性遍历。** 有 span 时是 $O(\log n)$；面试要能说清 span 累加为何不重不漏。

**误区四：原地修改结点 score。** score 是关键字的一部分，改它会破坏有序，必须删除再插入。

**误区五：忽略 listpack 阈值。** 调优 `zset-max-listpack-entries` 能显著省内存；不是所有 zset 都需要跳表。

## 七、与开源书/权威来源对应

1. **Redis 源码 `src/t_zset.c`**（`zslInsert`、`zslDeleteNode`、`zslRandomLevel`）与 `server.h` 中 `zskiplistNode` 定义。
2. **Redis 官方文档 Data types / Sorted sets** —— 命令复杂度与编码说明。
3. **CyC2018/CS-Notes** Redis 章节「数据结构与对象」。
4. **antirez 公开讨论**（为何 zset 用跳表而非红黑树）。

## 八、面试题

**Q1：zset 为什么是「跳表+哈希」而不是单一结构？**
A：跳表负责有序、范围、排名；哈希负责 $O(1)$ 按 member 查 score。单一结构无法同时以低复杂度满足全部命令。

**Q2：span 字段有什么用？**
A：记录每层指针跨越的底层结点数，查找路径上累加即得排名，使 `ZRANK` 为 $O(\log n)$。

**Q3：`ZADD` 更新已有成员的 score，底层发生了什么？**
A：dict 更新分值前先查旧值；跳表因关键字含 score，必须删除旧结点再按新 (score, member) 插入，保证有序。

**Q4：为什么小 zset 用 listpack？**
A：小集合上跳表指针与 span 开销占比高；listpack 连续内存、缓存友好、内存极省，超过阈值再升级。

## 九、演进与趋势

Redis 持续演进 zset 编码：ziplist → listpack（消除连锁更新隐患），阈值可配。大 key 与集群场景推动**分片 zset**、**过期与淘汰**策略。开源替代（KeyDB、Dragonfly）沿用跳表+哈希并优化内存与并发。研究与工程前沿还包括**持久化跳表**（崩溃恢复更简单）、**并发 zset**、以及**向量检索 + 有序过滤**（用跳表思想做 range filter）。面试趋势要求能把「命令语义 → 结构字段 → 复杂度」串成一条线，而非背结论。

## 十、小结

Redis zset 以跳表维护 (score, member) 全序，支撑范围与排名；以哈希实现 $O(1)$ 查分；以 span 把 `ZRANK` 做到 $O(\log n)$；小集合再退回 listpack 省内存。这是一套把「有序、精确、排名、内存」四维需求一次打穿的工程设计，也是跳表从论文走进工业界的最著名案例。
