# CRDTs与无冲突复制

> 对应 Shapiro, Preguiça, Baquero & Zawirski 2011《A Comprehensive Study of Convergent and Commutative Replicated Data Types》、Kleppmann《Designing Data-Intensive Applications》第 5 章、DeCandia et al. 2007（Dynamo 的冲突背景），以及 Kleppmann et al. 2019《Local-first software》。

## 一、背景与挑战

最终一致系统一旦允许并发写，冲突就不可避免：两个副本在不同分区里各自修改同一份数据，恢复分区后无法简单判定「谁对」。传统做法是把冲突暴露给应用层（如 Dynamo 的 sibling 交给业务合并），负担沉重：应用必须理解向量时钟、实现合并逻辑，还要保证合并是确定性的——否则不同节点按不同顺序合并会得出不同结果，收敛性被破坏。CRDT（Conflict-free Replicated Data Type）的思路是把「正确合并」下沉到数据结构本身，用数学结构保证任意副本以任意顺序合并都得到相同结果，把「最终一致」升级为「可证明收敛的无冲突最终一致」。

## 二、核心原理

CRDT 分两大族。基于状态的 CvRDT（convergent）：副本交换完整状态（或其摘要），用合并函数把两个状态合成一个。基于操作的 CmRDT（commutative）：副本广播操作，只要操作满足可交换性，各副本按不同顺序应用也得到相同结果。

CvRDT 的正确性依赖「单调半格」（join-semilattice）结构：状态集合上定义偏序 $\sqsubseteq$ 与最小上界运算 $\sqcup$（join），合并函数就是 $\sqcup$。只要本地更新是单调递增的（更新只把状态推向更大元素，永不回退），并且合并取最小上界，则系统必然收敛——证明只用到 $\sqcup$ 的三条代数性质，与网络顺序完全无关。

CmRDT 的正确性依赖操作交换律与因果投递：操作必须能互换顺序而不影响最终状态，且系统需保证因果序（不满足因果的操作延迟应用）。这需要额外元数据（如版本向量）判定操作是否就绪，代价更高，但传输量通常更低（只传操作而非完整状态）。

常见类型：G-Counter（逐分量取最大值，值取各分量之和）、PN-Counter（由两个 G-Counter 组成）、G-Set（合并取并集）、2P-Set（带墓碑的增删集合）、OR-Set（用唯一标签支持并发增删）、LWW-Register（时间戳最后写胜出）、MV-Register（保留并发版本）、以及 RGA/Logoot/YATA 等序列类型。

序列类 CRDT 最复杂，因为「插入位置」必须用不可变标识而非整数索引表达。典型做法是给每个字符分配一个在稠密序上可比较且可无限细分的标识（分数索引或树路径），插入时生成位于两个邻居标识之间的新标识，从而保证并发插入的最终顺序在所有副本上一致。

## 三、形式化与数学基础

CvRDT 要求 $(S, \sqsubseteq, \sqcup)$ 构成 join-semilattice，合并满足三条性质：

$$ a \sqcup b = b \sqcup a \quad(\text{交换}), \qquad (a \sqcup b) \sqcup c = a \sqcup (b \sqcup c) \quad(\text{结合}), \qquad a \sqcup a = a \quad(\text{幂等}) $$

此外要求合并单调（$a \sqsubseteq a \sqcup b$）且本地更新 $f$ 单调递增（$a \sqsubseteq f(a)$）。在这些条件下，任意副本只要收到相同的更新集合，最终状态相同：

$$ \forall i,j:\ \text{merge-all}(\text{updates})_i = \text{merge-all}(\text{updates})_j $$

CmRDT 的收敛条件可表述为并发操作对换序不敏感：

$$ \forall o_1, o_2 \text{ concurrent}:\ \text{apply}(\text{apply}(s, o_1), o_2) = \text{apply}(\text{apply}(s, o_2), o_1) $$

以 G-Counter 为例，状态为向量 $c = (c_1, \dots, c_n)$，副本 $i$ 只增自己分量，合并为逐分量最大值，读出值为各分量之和：

$$ (a \sqcup b)_i = \max(a_i, b_i), \qquad \text{value}(c) = \sum_{i=1}^{n} c_i $$

$(\mathbb{N}^n, \le, \max)$ 构成 join-semilattice，故必然收敛。注意其元数据规模与副本数成正比：$n$ 个副本就需要 $n$ 个计数器，这是 CRDT 的固有代价。

## 四、代码实现

G-Counter 与 PN-Counter：

```python
class GCounter:
    def __init__(self, n_replicas, rid):
        self.c = [0] * n_replicas
        self.rid = rid
    def increment(self):
        self.c[self.rid] += 1
    def value(self):
        return sum(self.c)
    def merge(self, other):
        # 逐分量取最大：满足交换、结合、幂等
        self.c = [max(x, y) for x, y in zip(self.c, other.c)]

class PNCounter:
    def __init__(self, n, rid):
        self.inc, self.dec = GCounter(n, rid), GCounter(n, rid)
    def increment(self): self.inc.increment()
    def decrement(self): self.dec.increment()
    def value(self):     return self.inc.value() - self.dec.value()
    def merge(self, other):
        self.inc.merge(other.inc); self.dec.merge(other.dec)
```

OR-Set 用唯一标签支持并发增删，删除只移除「观察到的」标签，因此并发新增不受影响：

```python
class ORSet:
    def __init__(self):
        self.adds = {}          # element -> set(tag)
        self.removed = set()    # 已被删除的 tag
    def add(self, e, tag):
        self.adds.setdefault(e, set()).add(tag)
    def remove(self, e):
        for t in self.adds.get(e, set()):
            self.removed.add(t)
        self.adds.pop(e, None)
    def contains(self, e):
        return any(t not in self.removed for t in self.adds.get(e, set()))
    def merge(self, other):
        for e, tags in other.adds.items():
            self.adds.setdefault(e, set()).update(tags)
        self.removed |= other.removed
```

OR-Set 的元数据随增删单调增长（标签永不回收），这是长期运行场景下的主要成本。LWW-Register 的边界情况也值得单独提：它依赖时间戳排序，时钟不同步时可能错误地丢弃一次真实更新，这是它与 CRDT 精神的张力所在。

## 五、与其他技术对比

| 方案 | 合并规则 | 是否丢更新 | 元数据规模 | 需要时钟同步 | 适用数据 |
| --- | --- | --- | --- | --- | --- |
| 向量时钟 + 应用合并 | 应用自定义 | 不丢 | 与副本数成正比 | 否 | 通用但复杂 |
| LWW（最后写胜） | 时间戳比较 | 可能丢 | 极小 | 是（关键依赖） | 用户配置、昵称 |
| G-Counter / PN-Counter | 逐分量最大值 | 不丢 | 与副本数成正比 | 否 | 计数、点赞、库存增量 |
| OR-Set | 标签并集 + 删除集 | 不丢 | 随操作单调增长 | 否 | 标签、购物车项 |
| 序列 CRDT（RGA/YATA） | 标识序合并 | 不丢 | 与字符数相关 | 否 | 协同编辑、文本 |
| 中心化串行化 | 无需合并 | 不丢 | 无 | 否 | 强一致场景 |

核心权衡是「表达能力与元数据成本的对立」：LWW 元数据极小但会丢更新；计数器与集合类不丢更新但元数据与副本数或操作数成正比；序列 CRDT 表达力最强但每字符带标识，元数据与文档长度成正比。

## 六、常见误区

1. 认为任何数据类型都能直接 CRDT 化。合并函数必须满足交换、结合、幂等，本地更新必须单调；「设为某个绝对值」这类操作需要换成合适结构。
2. 忽略元数据增长。PN-Counter 需要与副本数同阶的计数器，OR-Set 标签永不回收，序列 CRDT 每字符带标识，长期运行后元数据可能远超数据本身。
3. 认为 CRDT 不需要任何通信保证。它不需要共识，但仍需要可靠广播或最终通信，否则更新根本到不了对端。
4. 误用 LWW 并假设时钟可信。时钟漂移会让「最后写入」判定出错，造成静默丢更新，是生产环境最常见的事故来源之一。
5. 认为 CRDT 能给出「业务正确」的结果。它只保证所有副本一致，不保证符合业务预期（例如并发扣库存不超卖）。
6. 忽略墓碑回收。删除信息需保留以防「删除被复活」，回收策略必须谨慎，否则已删元素会重新出现。

## 七、与开源书·权威来源对应

- Shapiro, Preguiça, Baquero & Zawirski 2011：CRDT 的系统性定义、CvRDT/CmRDT 分类与收敛性证明。
- Kleppmann《Designing Data-Intensive Applications》第 5 章：复制与并发写冲突的工程处理，CRDT 的实践定位。
- DeCandia et al. 2007：Dynamo 把冲突交给应用合并的原始设计，是 CRDT 出现的直接动因。
- Kleppmann et al. 2019《Local-first software》：CRDT 在端侧协作场景的应用范式。
- Herlihy & Shavit《The Art of Multiprocessor Programming》：并发对象与可交换性的理论背景。
- Automerge 与 Yjs 文档：序列 CRDT 的工程实现参考。

## 八、面试题

1. CRDT 为什么能无冲突合并？
   要点：合并函数构成 join-semilattice 的最小上界，满足交换、结合、幂等；本地更新单调递增，因此任意顺序合并结果相同，收敛性可证。

2. CvRDT 与 CmRDT 的区别？
   要点：CvRDT 交换状态并按 $\sqcup$ 合并，实现简单但传输量大；CmRDT 广播操作，传输量小但要求因果投递与操作可交换，元数据更复杂。

3. LWW-Register 有什么风险？
   要点：依赖时间戳排序，时钟不同步时可能丢弃真实更新；优点是元数据极小、合并极简，适合能容忍丢更新的配置类数据。

4. 为什么序列 CRDT 不能用整数索引表示插入位置？
   要点：并发插入会让整数索引语义歧义，且索引会随其他插入失效；必须用不可变、可稠密细分的标识保证并发顺序一致。

5. G-Counter 的元数据规模有何影响？
   要点：与副本数 $n$ 同阶，副本数增加时线性增长；这是 CRDT 固有成本，需要副本集合稳定或做状态压缩。

## 九、演进与趋势

趋势一是在不丢更新的前提下压缩元数据：delta-state CRDT 只传播增量而非全量状态，配合墓碑回收与版本裁剪控制长期增长。趋势二是向端侧与本地优先软件扩散：Automerge、Yjs 把 CRDT 用于离线协同编辑，让应用在无中心服务器时仍能收敛。趋势三是与一致性模型的组合：CRDT 负责无冲突部分，需要更强语义的操作（唯一性约束、余额非负）仍需共识或协调，形成「CRDT + 少量共识」的混合架构。

## 十、小结

CRDT 把「最终一致」升级为「无冲突最终一致」：通过让合并函数具备交换、结合、幂等三条代数性质，并让本地更新保持单调，使得任意副本以任意顺序合并都得到相同结果，无需协调即可收敛。它的代价是元数据增长与数据类型受限——LWW 元数据小但会丢更新，计数器与集合类不丢更新但元数据与副本数或操作数成正比，序列类型表达力最强但每字符带标识。理解这三条代数性质与对应代价，是判断一个业务能否安全 CRDT 化的唯一标准。
