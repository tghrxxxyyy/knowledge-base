# DNSSEC

> 对应 RFC 4033 / RFC 4034 / RFC 4035（DNSSEC 协议族）；RFC 5155（NSEC3）；RFC 6840（实现澄清）；RFC 6781（运营实践）。

## 一、背景与挑战
原始 DNS 假设「网络内彼此信任」，查询与应答均为明文，没有任何来源认证。由此衍生三类问题：其一，缓存投毒——攻击者抢答，把伪造记录注入递归解析器缓存（Kaminsky 类攻击以大量随机子域查询挤占应答窗口）；其二，中间人篡改——运营商设备或链路中间盒重写应答；其三，伪造否定应答——把「域名不存在」塞回客户端以实现流量劫持。

DNSSEC 的目标是给出**数据起源认证（origin authentication）与完整性（integrity）**，让解析器能验证「这条记录确实由该区签署且未被改动」。它**不提供机密性**，也不隐藏查询内容，因此必须与 DoH/DoT 等传输加密配合。工程上的核心挑战是：信任如何自根逐级传递、密钥如何轮转、否定应答如何可证、以及签名带来的报文膨胀与运维复杂度。

## 二、核心原理
DNSSEC 引入四类记录。**RRSIG** 是对一个 RRSet（同名同类型同类的记录集合）的签名，被签内容除记录本身外还包含签发者名、算法、标签数、**原始 TTL**、有效期（inception/expiration）与签名者 key tag，任何一项不一致都会验签失败。**DNSKEY** 存放区的公钥，带 SEP（Secure Entry Point）位的是 KSK，其余为 ZSK。**DS** 存于父区，是子区 KSK 的摘要，构成信任链的「挂钩」。**NSEC/NSEC3** 用于证明「某名或某类型不存在」。

双密钥结构做职责分离：ZSK 高频签区数据、体积可较小，轮转廉价；KSK 只签 DNSKEY RRSet，可离线保存、低频轮转，只需在父区更新一次 DS。解析器验证自顶向下：从预置信任锚（根 KSK）出发，用 KSK 验证 DNSKEY RRSet，再用 DS 下钻到子区，逐级建立「已验证的信任链」，最后用子区 ZSK 验证目标 RRSet。若中间某区未签名，链即断裂，形成「孤岛」。

## 三、形式化与数学基础
对 RRSet $R$ 与规范化后的 RRSIG 字段集合 $F$，签名与验证为：
$$ \sigma = \mathrm{Sign}_{SK_{ZSK}}(F \| R),\qquad \mathrm{Verify}_{PK_{ZSK}}(F \| R,\ \sigma) \in \{0,1\} $$
DNSKEY 自身由 KSK 背书，父区 DS 则给出摘要：
$$ DS = H(\mathrm{ownerName} \| \mathrm{DNSKEY.RDATA}) $$
验证链可写成归纳式。设 $\mathrm{Trust}(\text{root KSK})$ 为信任锚，则
$$ \mathrm{Trust}(K_{child}) \Leftarrow \mathrm{Trust}(K_{parent}) \wedge \mathrm{Verify}_{K_{parent}}(DS_{child}) \wedge \mathrm{Verify}_{K_{child}}(DNSKEY_{child}) $$
否定应答的证明依赖「覆盖区间」：NSEC 记录列出「本名的下一个已有名」，从而可证明目标名落在 $(\mathrm{name}_i,\ \mathrm{name}_{i+1})$ 的空隙内。NSEC3 对名字做加盐迭代哈希以避免明文枚举：
$$ \mathrm{NSEC3Hash} = H^{k}(\,H(\mathrm{name}) \,\|\, \mathrm{salt}\,) $$
其中 $k$ 为迭代次数，据此构造有序哈希链并配合 opt-out 标记跳过不安全的委托。迭代次数需按当前算力与官方最新建议取值。

## 四、代码实现
一次典型的带签名应答结构（签名值与摘要已省略）：
```text
$ dig +dnssec www.example.com A
www.example.com.  300   IN  A      93.184.216.34
www.example.com.  300   IN  RRSIG  A 13 3 300 20260101000000 20251201000000 12345 example.com. <sig>
example.com.      3600  IN  DNSKEY 257 3 13 <KSK pub>     ; SEP
example.com.      3600  IN  DNSKEY 256 3 13 <ZSK pub>
example.com.      3600  IN  RRSIG  DNSKEY 13 2 3600 ... 12345 example.com. <sig by KSK>
com.              86400 IN  DS     12345 13 2 <digest>
```

解析器侧验证流程可抽象为：
```python
def validate(name, rtype, ctx):
    rrset, sig = ctx.fetch(name, rtype, want_sig=True)
    key = ctx.get_validated_dnskey(sig.signer_name)  # 沿 DS 链递归验证得到
    if key is None:
        return "INSECURE"           # 上游未签名，链断
    if not verify(rrset, sig, key):
        return "BOGUS"              # 内容被改或签名不符
    if not (sig.inception <= now() <= sig.expiration):
        return "BOGUS"              # 过期/未生效签名
    return "SECURE"
```

签名区侧（zone 文件先交给签名器，再加载到权威）：
```text
$ dnssec-signzone -S -K keys -o example.com example.com.zone
# 产出 example.com.zone.signed，内含 RRSIG 与 NSEC/NSEC3 记录
```

## 五、与其他技术对比
| 维度 | DNSSEC | DoH/DoT | Web PKI (TLS) | DNSCrypt |
| --- | --- | --- | --- | --- |
| 保护目标 | 起源认证 + 完整性 | 传输机密性 + 完整性 | 传输 + 端点认证 | 传输加密 |
| 是否加密内容 | 否 | 是 | 是 | 是 |
| 信任模型 | 层级签名链，根为锚 | 依赖所选解析器的 TLS | 多根 CA 体系 | 解析器公钥 |
| 可否验证否定应答 | 可以（NSEC/NSEC3） | 不可以 | 不适用 | 不可以 |
| 端到端可验证性 | 是（可下推到 stub） | 否（信任解析器） | 部分 | 否 |
| 部署复杂度 | 高（轮转、断链、放大） | 低 | 中 | 中 |

## 六、常见误区
1. **「DNSSEC 加密 DNS」**——错。只签名认证，链路仍是明文，谁都能看到你查了什么，除非叠加 DoT/DoH。
2. **「部署 DNSSEC 就防所有攻击」**——错。不防 DoS，不隐藏查询，也不防权威区私钥泄露后签发恶意记录。
3. **「NSEC 会泄露全部域名」**——方向正确：NSEC 遍历（zone walking）可枚举区内名字，故引入 NSEC3 哈希化与 opt-out；但 NSEC3 可被离线字典攻击，是已知权衡而非缺陷。
4. **「签名过期无所谓」**——错。RRSIG 有 inception/expiration，过期即 BOGUS，时钟漂移是高频故障源。
5. **「算法一成不变」**——错。旧摘要与签名算法已进入退场流程，需关注官方最新建议的算法清单；具体支持矩阵以官方最新文档为准。

## 七、与开源书·权威来源对应
- RFC 4033：DNSSEC 的引入、威胁模型与需求，解释「为什么需要」。
- RFC 4034：DNSKEY / RRSIG / DS / NSEC 的记录定义与规范化规则，解释「长什么样」。
- RFC 4035：协议修改点，含 DO/AD/CD 标志与解析器的验证行为。
- RFC 5155：NSEC3，针对 zone walking 的哈希链方案与 opt-out 语义。
- RFC 6840：实现细节澄清，减少互操作歧义（如通配符签名的处理）。
- Kurose & Ross《Computer Networking: A Top-Down Approach》第 2 章 DNS：把 DNS 与安全需求放回应用层语境。
- Tanenbaum《Computer Networks》应用层中关于可信名字系统与分层的讨论。

## 八、面试题
1. **ZSK 与 KSK 为何分离？** 要点：职责分离；ZSK 频繁签名、体积小；KSK 仅签 DNSKEY，便于离线保存与低频轮转，且父区 DS 只需在轮转时更新一次。
2. **信任链如何建立？** 要点：根信任锚 → 父区 DS（子区 KSK 摘要）→ 子区 DNSKEY → 子区 RRSIG；任一环缺失或验证失败即断链或 BOGUS。
3. **如何证明一个域名不存在？** 要点：NSEC 给出相邻已有名的区间证明；NSEC3 用加盐迭代哈希避免枚举，opt-out 处理不安全委托。
4. **DNSSEC 与 DoH 谁防投毒？** 要点：DNSSEC 提供可验证的来源认证，是防投毒正解；DoH 只保证到所选解析器这一段不被监听与篡改。
5. **签名过期会发生什么？** 要点：判为 BOGUS，多数解析器返回 SERVFAIL 而非接受未验证数据，避免降级攻击。

## 九、演进与趋势
算法侧，ECDSA（P-256）与 Ed25519 因签名短、验签快，正逐步替代 RSA；根区与主流 TLD 的支持随时间推进，**具体支持矩阵以官方最新文档为准**。运营侧，自动化签名与预发布密钥轮转（先发布新密钥再切换签名）成为降低人为失误的主流做法，密钥生成与签名的职责也常拆到不同主机。协议侧，NSEC3 opt-out、多签名者（multi-signer）模型、以及把验证下沉到终端 stub 都在演进；与 DoH/DoT 组合形成「认证 + 加密」双保险是当前公认方向。签名放大与 UDP 分片问题则推动了解析器 EDNS(0) 缓冲与 TCP 回退策略的持续调整。

## 十、小结
DNSSEC 用层级签名链为 DNS 记录提供起源认证与完整性，并通过 NSEC/NSEC3 让「不存在」也可被证明，从而封堵缓存投毒与伪造否定应答。它不加密、不隐藏查询、不防 DoS，必须与传输加密和良好的密钥运营共同构成体系。掌握 KSK/ZSK 分离、DS 挂钩、信任链下钻、签名有效期与算法退场，是理解与运维 DNSSEC 的关键。
