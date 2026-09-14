# 缓存与TTL

> 对应 RFC 1034 / RFC 1035（缓存语义与 TTL 字段）；RFC 2308（否定缓存）；RFC 8767（Serve Stale）；RFC 8499（术语）。

## 一、背景与挑战
若每次解析都走完整递归（根→TLD→权威），延迟高、成本大，且会瞬间压垮根与 TLD。缓存让解析器与客户端复用结果，是把 DNS 从「不可扩展」变成「可扩展」的关键机制。代价是**一致性被弱化**：缓存期间权威上的变更对已缓存者不可见。

由此产生的工程问题包括：变更如何尽快生效（TTL 与旧缓存）、缓存过期与并发（thundering herd，大量客户端同时过期并集中回源）、否定结果是否值得缓存（NXDOMAIN 若不缓存将放大对不存在的查询）、上游不可用时是否宁可返回过期数据（serve-stale）、以及缓存投毒防护（只接受与当前委派链匹配的记录）。这些权衡共同决定了 TTL 的取值策略。

## 二、核心原理
每条 RR 都带 TTL（秒），表示允许缓存的最大时长。解析器收到应答时记下「当前时间 + TTL」为绝对过期时刻，在有效期内直接复用，过期则重新查询。TTL 由权威区管理员设定，反映该记录变更频率：稳定记录可给数小时甚至更长，故障转移类记录常给几十秒到几分钟。

**否定缓存（RFC 2308）** 缓存 NXDOMAIN（名字不存在）与 NODATA（名字存在但该类型无记录）两类响应。其 TTL 取自 SOA 记录中字段与 MINIMUM 规则，避免不存在的名字被反复回源。**Serve-stale（RFC 8767）** 允许在上游不可用时短暂返回已过期数据，以可用性换精度，并把「stale 时长」纳入上限与运维监控。解析器还需遵守**委派一致性**：只接受与当前已知委派（NS/DS）一致的记录，拒绝「越权」的无关应答，这是防投毒的结构性约束。此外，TTL 必须按「已流逝时间」递减后再转发给下游，否则会同步放大缓存寿命。

## 三、形式化与数学基础
缓存的绝对过期时刻与剩余 TTL：
$$ t_{expire} = t_{cache} + \mathrm{TTL},\qquad \mathrm{TTL}_{remain} = \max(0,\ t_{expire} - t_{now}) $$
转发给下游的 TTL 应取剩余值，避免缓存寿命被逐级重算放大。设权威记录更新发生在 $t_{upd}$，缓存写入于 $t_{cache}$，则某客户端最晚看到旧值的时刻为
$$ t_{stale}^{max} = t_{cache} + \mathrm{TTL} $$
即全量收敛时间上限接近 TTL（忽略最后一跳客户端缓存）。命中率与缓存容量的关系可用「请求频次 × TTL」的工作集近似：
$$ W = \sum_{k \in K} \lambda_k \cdot \mathrm{TTL}_k $$
工作集超过解析器缓存容量时，命中率骤降、回源陡增——这也是「把 TTL 设得过长」与「设得过短」之间的核心权衡量。负缓存收益同理：设不存在名字的查询率为 $\lambda_{nx}$，负缓存将其回源成本降为分片后的 $1/(\lambda_{nx}\cdot \mathrm{TTL}_{neg})$ 量级。

## 四、代码实现
查看 TTL 与负缓存行为：
```bash
# 首列数字为当前剩余 TTL（来自缓存时会递减）
dig +noall +answer www.example.com A
# 观察否定应答与 SOA MINIMUM 决定的负缓存 TTL
dig +noall +authority nonexistent.example.com A
```

一个带负缓存与 stale 的最小缓存（示意，省略并发控制）：
```python
import time

class RRsetCache:
    def __init__(self, stale_ttl=0):
        self.store = {}          # key -> (records, expire_at, neg)
        self.stale_ttl = stale_ttl

    def _key(self, name, rtype):
        return (name.lower(), rtype.upper())

    def get(self, name, rtype, now=None):
        now = now or time.time()
        recs, exp, neg = self.store.get(self._key(name, rtype), (None, 0, False))
        if recs is None:
            return None, "MISS"
        if now < exp:
            return recs, "HIT"
        if self.stale_ttl and now < exp + self.stale_ttl:
            return recs, "STALE"          # 上游故障时可用
        return None, "EXPIRED"

    def put(self, name, rtype, recs, ttl, neg=False):
        self.store[self._key(name, rtype)] = (recs, time.time() + ttl, neg)
```

## 五、与其他技术对比
| 维度 | DNS 缓存（TTL） | HTTP 缓存（max-age/ETag） | CDN 边缘缓存 | 数据库缓存 |
| --- | --- | --- | --- | --- |
| 失效驱动 | 纯时间（TTL） | 时间 + 校验（可 304） | 时间 + 主动 purge | 事件/写穿透/失效 |
| 是否可主动刷新 | 权威可缩短下次 TTL | 可 revalidate | 可 purge | 可显式失效 |
| 一致性 | 最终一致（弱） | 最终一致 | 最终一致 | 可做到强一致 |
| 否定缓存 | 有（RFC 2308） | 视实现 | 视实现 | 视实现 |
| 过期后行为 | 重新解析 | 条件请求 | 回源 | 回源 |
| 主要风险 | 变更延迟、投毒 | 陈旧内容 | 陈旧内容 | 脏读 |

## 六、常见误区
1. **「改 DNS 立即全球生效」**——错。生效时间取决于 TTL 与各级缓存分布，最坏可到 TTL 上限；先降 TTL 再切换、切换后再升回，是标准操作。
2. **「TTL 越长越好」**——错。缓存收益上升但变更延迟变大，故障切换变慢；TTL 是可用性与灵敏度的折中。
3. **「TTL=0 就一定不缓存」**——多数字典意义上的「不缓存」，但不少解析器仍设最小缓存时间以自保；调研时不能假设等于零。
4. **「否定应答不用缓存」**——错。不缓存 NXDOMAIN 会让随机子域洪水直接打到权威，正是需要负缓存的原因。
5. **「TTL 会随转发重算」**——错。正确实现必须递减剩余 TTL，否则每级转发都会「重置寿命」，形成长尾陈旧。

## 七、与开源书·权威来源对应
- RFC 1034：缓存与 TTL 的基本语义、解析算法中缓存的角色。
- RFC 1035：RR 中 TTL 字段的定义与取值规范。
- RFC 2308：否定缓存，给出 NXDOMAIN/NODATA 的缓存规则与 SOA 用法。
- RFC 8767：Serve-Stale，过期数据在故障期间的可用性策略。
- RFC 8499：术语表，统一 TTL / negative caching / stale 等表述。
- Kurose & Ross《Computer Networking: A Top-Down Approach》第 2 章：缓存对 DNS 可扩展性的作用。
- Stevens《TCP/IP Illustrated, Volume 1》DNS 章节：报文中的 TTL 与实际观测方法。

## 八、面试题
1. **改了 A 记录，为什么部分地区还是旧 IP？** 要点：各级缓存未过期；应先降低 TTL、等待旧 TTL 走完再切换，并结合多解析器实测。
2. **负缓存的意义？** 要点：抑制对不存在名字的重复回源，保护权威并降低延迟；TTL 由 SOA 相关字段决定。
3. **TTL 太短有什么代价？** 要点：回源量上升、缓存命中率下降、权威与解析器压力变大，甚至形成自伤式放大。
4. **Serve-stale 解决什么？** 要点：上游不可用时返回过期数据保可用性，需设上限并监控 stale 命中率。
5. **转发时 TTL 怎么处理？** 要点：必须按已流逝时间递减，不能重置；否则缓存寿命被逐级放大导致陈旧。

## 九、演进与趋势
协议侧，EDNS Client Subnet 让权威按客户端子网返回不同答案，配合短 TTL 实现精细调度，但也带来缓存碎片化与隐私争议。可用性侧，Serve-stale 与预取（prefetch）已成为主流解析器配置项。防投毒侧，源端口随机化、0x20 编码、DNSSEC 验证共同提高伪造难度。运维侧，「先降 TTL 再变更」的变更流程化、以及把 TTL 纳入 SLO 观测（如变更后多久全量收敛），正逐步取代靠经验拍数值的做法。具体实现默认参数请以各家**官方最新文档**为准。

## 十、小结
TTL 驱动的缓存是 DNS 可扩展的根基：它以「最终一致」换取极低的平均延迟与回源成本，并靠否定缓存、serve-stale、委派一致性等机制补齐可用性与安全性。TTL 的取值是缓存命中与变更灵敏度之间的显式折中，而「转发递减剩余 TTL」是判断实现是否正确的经典细节。掌握这套机制，才能解释变更延迟、诊断陈旧解析并设计安全的切换流程。
