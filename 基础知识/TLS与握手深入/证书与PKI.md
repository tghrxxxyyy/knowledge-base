# 证书与PKI

> 对应 RFC 5280（X.509 v3）；RFC 6962（Certificate Transparency）；RFC 8555（ACME）；RFC 6125（证书校验）。

## 一、背景与挑战

密钥交换解决了「共享秘密」，但仍要回答「对面真的是它声称的域名 / 实体吗」。公钥基础设施（PKI）引入可信第三方——证书授权中心（CA），把「实体身份 ↔ 公钥」通过签名绑定成证书。威胁模型包括：恶意或被入侵 CA 签发虚假证书、证书私钥泄露、域名所有权转移后旧证书仍有效，以及中间人用合法证书对受害者伪装。PKI 的目标是在不要求通信双方预先共享秘密的前提下，建立可被验证的身份信任链。

信任过于集中是 PKI 的结构性弱点：任何一家被信任的根 CA 被攻破，理论上可对任意域名签发证书。因此现代体系用「中间 CA + 根 CA 离线」的层级来缩小单点爆炸半径，并用 CT 日志提供事后审计能力。

此外，证书还承载公钥算法与密钥用途约束，使同一证书不能既用于服务器认证又用于代码签名，进一步限制泄露后的滥用面。理解这些约束是正确校验证书的前提。

需要强调的是，PKI 的失败模式往往是「验证方实现不一致」而非「协议设计缺陷」：有的客户端忽略吊销检查、有的仍接受 CN 匹配、有的不校验 Basic Constraints，正是这些实现差异造成了大量真实漏洞。

## 二、核心原理

证书本质是 CA 用其私钥对「to-be-signed（tbs）」字段的签名，tbs 含主体（subject）、公钥、有效期（notBefore/notAfter）、序列号、SAN（Subject Alternative Name）、密钥用法扩展等。客户端验证时沿「终端实体证书 ← 中间 CA ← 根 CA」向上，用每级签发者公钥验证下一级签名，直到落入操作系统/浏览器内置的「信任锚（根）」。域名校验用 SAN，CN 字段已被弃用为校验依据（RFC 6125）。

验证还需检查有效期、吊销状态（CRL/OCSP）与密钥用法约束。证书链长度、路径长度约束（Basic Constraints 的 path len）以及名称约束（Name Constraints）都是防止越权签发的重要机制，根 CA 私钥通常离线冷存以降低泄露风险。服务器还需在握手时发送完整的证书链（除根外），否则客户端无法构建到信任锚的路径。

一个常见工程细节是「链是否完整」：服务端只发终端证书而漏发中间 CA，会让部分客户端（依赖 AIA 抓取）成功、部分失败，表现为「某些设备能访问、某些不能」的诡异现象。因此部署后必须用多种客户端交叉验证链的完整性。

## 三、形式化与数学基础

签名生成：

$$Sig = Sign_{CA\_priv}\big(Hash(tbsCertificate)\big)$$

常见算法为 RSA-PKCS#1 v1.5 / RSA-PSS / ECDSA / EdDSA。链验证递归：

$$\forall i:\ Verify_{CA_i\_pub}\big(Hash(tbs_{i+1}),\ Sig_{i+1}\big)=true \land valid(Until_i) \land anchored(root)$$

吊销检查另有 CRL（RFC 5280）与 OCSP（RFC 6960），OCSP Stapling（RFC 6961）让服务器直接附带 OCSP 响应，省去客户端单独查询并降低隐私泄露。证书透明度（CT）则引入第三类验证：证书必须出现在公开可审计的默克尔树日志中，浏览器据此拒绝未记录的证书，使伪造证书可被公开发现。

CT 的日志结构是「仅追加的默克尔树（Merkle Tree）」，因而支持「包含证明（inclusion proof）」：客户端可验证某证书确实被记录在日志的某个位置，而无须下载整个日志。这是它能以极低带宽提供公开审计的原因。

## 四、代码实现

```python
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import padding

cert = x509.load_pem_x509_certificate(pem_bytes)
issuer_cert = load_issuer(cert)                 # 由 AIA 或本地仓库取得
# 用签发者公钥验证本证书签名
issuer_pub = issuer_cert.public_key()
issuer_pub.verify(
    cert.signature,
    cert.tbs_certificate_bytes,
    padding.PKCS1v15(),
    cert.signature_hash_algorithm,
)
# 再校验有效期与域名（SAN）
now = datetime.utcnow()
assert cert.not_valid_before <= now <= cert.not_valid_after
assert hostname in san_dns_names(cert)
# 进一步：检查 key usage、path length、CT SCT 是否齐备
```

```python
# OCSP Stapling：服务器附带 OCSP 响应，客户端免单独查询
ocsp_resp = cert.get_ocsp_response(stapled=True)
assert ocsp_resp.status == "good"   # 未被吊销

# 名称约束（Name Constraints）检查：中间 CA 只能为其子树内域名签发
def permitted_by_name_constraints(leaf, chain):
    for ca in chain[1:]:
        nc = ca.extensions.get("name_constraints")
        if nc and not nc.permits_dns(leaf.san_dns_names()):
            return False            # 越权签发，必须拒绝
    return True
```

完整验证必须把所有步骤串成一个「全部通过才算通过」的链式判定；任何一步被跳过（尤其是吊销与名称约束），都会让 PKI 的安全性退化为「只看签名对不对」。

## 五、与其他技术对比

| 维度 | PKI（中心化 CA） | Web of Trust（PGP） | Certificate Transparency | 证书钉扎 |
| --- | --- | --- | --- | --- |
| 信任模型 | 少数根 CA 信任锚 | 用户互签去中心 | 公开可审计日志 | 客户端固定预期公钥 |
| 防恶意签发 | 弱（依赖 CA 自律） | 弱 | 强（日志可发现） | 强（但易断链） |
| 撤销机制 | CRL/OCSP | 无强机制 | 监控日志 | 无 |
| 运维成本 | 低（自动化成熟） | 高 | 中（需提交 SCT） | 高（轮换即断链） |

PKI 的中心化带来运维便利却牺牲了抗单点沦陷能力；CT 是对中心化缺陷的「可观测性」补丁，而非去中心化替代。

## 六、常见误区

误区一：有证书就安全。错，还须校验链完整性、有效期、吊销状态、域名匹配与密钥用法。

误区二：自签名证书不可用。错，它只是缺信任锚，内网/测试场景配合手动信任即可。

误区三：CN 用于域名校验。错，现代标准用 SAN（RFC 6125）。

误区四：证书过期仍可继续用。错，过期须轮换，否则客户端拒绝并建立连接失败。

## 七、与开源书·权威来源对应

- RFC 5280 是 X.509 v3 与 CRL 的权威定义；RFC 6962 定义 CT 默克尔树日志，使伪造证书可被公开发现。
- RFC 8555 定义 ACME 协议（Let's Encrypt 自动签发），把证书生命周期工程化、短期化。
- RFC 6125 规定身份校验应基于 SAN 而非 CN，结束长期混乱。
- Kurose & Ross《Computer Networks》第 8 章「Certification authorities」介绍 CA 与信任链，可与协议细节互补。
- Bryant & O'Hallaron《CSAPP》在网络安全章节提及公钥基础设施，可与信任锚概念类比。

## 八、面试题

1. 证书链如何验证？要点：逐级用签发者公钥验签，直到信任锚；同时校验有效期、用途与域名约束。
2. 为什么 SAN 取代 CN 做域名校验？要点：CN 仅单值且易误用，SAN 支持多域名且语义明确（RFC 6125）。
3. OCSP Stapling 解决了什么？要点：避免客户端每次单独查 OCSP，降低延迟与隐私泄露风险。
4. CT 日志为什么能缓解恶意 CA？要点：所有证书须入公开日志，异常签发可被监控与审计发现。
5. 为什么「有证书」不等于「安全」？要点：还须校验链完整、有效期、吊销、SAN、密钥用法与名称约束，任一步跳过都可能被中间人利用。
6. 为什么短期证书正在取代吊销检查？要点：缩短有效期把「需要吊销」的窗口压到极小，从而回避 CRL/OCSP 的传播延迟与可用性问题。

## 九、演进与趋势

证书透明度（CT）已成公开审计标配，主流浏览器强制要求；ACME 让证书生命周期自动化（90 天短期证书），减少撤销依赖；短期证书加自动轮换正削弱 CRL/OCSP 的重要性；后量子签名（如 Dilithium）开始进入证书体系，私钥算法面临换代，且 CT 日志与 OCSP 均需同步支持更大签名。信任模型也在探索多根、多算法并行以增强韧性。

## 十、小结

PKI 用 CA 的层级签名把「身份 ↔ 公钥」绑定，客户端沿信任链逐级验签并校验约束条件，是 TLS 身份认证与信任传递的基础；CT 与 ACME 则分别补齐了「防恶意签发」与「自动化运维」两块短板。理解链验证、吊销与约束扩展，是排查证书错误（如 NET::ERR_CERT_*）与评估信任模型风险的前提；而「验证的完整性」往往比「有没有证书」更决定实际安全性。
