# TLS协议分层

> 对应 RFC 8446（TLS 1.3 架构）§1；RFC 5246（TLS 1.2）；RFC 6347（DTLS）；Stevens《TCP/IP Illustrated》卷 1。

## 一、背景与挑战

应用层（HTTP/SMTP 等）需要机密性、完整性、身份认证，但 TCP 是明文字节流，IP 更不提供任何安全。TLS 在传输层与应用层之间插入一个「安全子层」，对应用数据透明地加密与认证。设计上还要兼顾：分片与重组、密钥随握手阶段切换、握手消息与应用数据复用同一传输通道、错误与告警处理，以及 1.3 中把大部分握手消息加密带来的分层边界变化。分层的意义在于让上层协议（如 HTTP/2、HTTP/3 over QUIC）不必关心加密细节，而记录层的独立设计也便于替换 AEAD 算法与协商新特性。

分层还带来一个潜在的「跨层攻击面」：记录层的明文头（含内容类型与长度）若被用来推断上层语义，就可能形成长度侧信道（如通过记录长度推测压缩后明文长度）。这解释了为什么 1.3 要把内容类型「内移」到加密载荷里，并在记录层用统一的 `application_data` 掩盖真实类型。

## 二、核心原理

TLS 分为两层：（1）记录层（Record Layer）负责把上层消息分片、附加内容类型、用当前流量密钥做 AEAD 加密与认证；（2）握手层（Handshake）负责协商密码套件、交换密钥、身份认证，并在 1.3 中把大部分握手消息加密（EncryptedExtensions）。此外还有 ChangeCipherSpec（1.3 中仅作兼容占位）与 Alert 子协议。TLS 1.3 移除 RSA 密钥传输、静态 DH、CBC、RC4、压缩（防 CRIME 攻击），简化且硬化了分层结构，使记录层协议头更小、握手层更内聚。Alert 消息用于传达关闭通知与错误（如 bad_certificate、decrypt_error），是排错的重要信号。

密钥调度的「分层」也很关键：TLS 1.3 用 HKDF-Extract/Expand 从早期秘密逐级导出握手流量密钥、应用流量密钥与导出密钥（exporter）。每一层密钥单向派生且带上下文标签，使得「上一层泄露不等于下一层泄露」，与记录层的封装共同形成纵深。

## 三、形式化与数学基础

记录层外帧（1.3 明文头）：

$$ContentType(1)\ |\ LegacyVersion(2)\ |\ Length(2)\ |\ Inner$$

内层（加密后）为 $ContentType'\ +\ Version\ +\ Fragment$ 经 AEAD 处理。AEAD 密文：

$$C = AEAD\_Enc(key,\ nonce,\ plaintext,\ aad=header)$$

TLS 1.3 用序列号构造 nonce（而非显式随机数），AEAD 算法如 AES-128-GCM、AES-256-GCM、ChaCha20-Poly1305，每个记录独立计数防重放。关键约束：同一 (key, nonce) 对绝不可用于两次加密，否则 AEAD 的语义安全崩溃（密钥流复用灾难），其形式化破坏为：若 $C_1 = E_k(n, m_1), C_2 = E_k(n, m_2)$，则 $C_1 \oplus C_2 = m_1 \oplus m_2$，直接泄漏明文异或。

序列号机制还承担抗重放职责：接收端维护期望序号，若收到重复或跳号的记录，即使密文可解密也必须拒绝，否则攻击者可通过重放旧记录操纵上层协议状态。这把「完整性」与「新鲜性」统一到记录层的序号检查里。

## 四、代码实现

```c
// 记录层封装（伪代码）：AEAD seal
typedef struct { uint8_t type; uint16_t len; uint8_t *body; } Record;

int record_seal(Record *r, const uint8_t *key, const uint8_t *nonce,
                const uint8_t *aad) {
    // plaintext = 真实内容类型 + 版本 + 分片
    size_t ct_len = r->len + TAG_LEN;
    aead_encrypt(key, nonce, r->body, r->len, aad, r->body, &ct_len); // 输出含 tag
    return 0;
}
// 解密端用同一 key/nonce 验 tag，失败则发 alert 并终止连接
// 序列号随每条记录递增，写入 nonce，绝不可重复
```

```c
// 记录层分片：超限需拆成多条记录
#define MAX_FRAG 16384   // 2^14 字节
while (len > MAX_FRAG) {
    emit_record(type, buf, MAX_FRAG);   // 单条记录上限 2^14
    buf += MAX_FRAG; len -= MAX_FRAG;
}
emit_record(type, buf, len);            // 末条

// 接收端：先检查序号新鲜性，再验 tag，最后解密
if (seq <= recv_expected_seq) return ALERT_BAD_RECORD;  // 重放/乱序拒绝
if (!aead_decrypt(key, nonce_of(seq), in, inlen, aad, out)) return ALERT_DECRYPT;
recv_expected_seq = seq + 1;
```

序号检查必须在解密之前（或至少在把明文交给上层之前）完成，且失败路径不能因记录内容不同而表现不同，否则会引入可观测的行为差异。

## 五、与其他技术对比

| 维度 | TLS | DTLS（RFC 6347） | SSH |
| --- | --- | --- | --- |
| 传输层 | TCP | UDP | TCP |
| 分层 | 记录层 + 握手层 | 同 TLS + 重传/无状态 Cookie | 单协议多通道 |
| 握手加密 | 1.3 大部分加密 | 同 1.3 | 部分加密 |
| 重传 | 由 TCP 提供 | 自身实现 | 自身实现 |
| 抗重放 | 序号检查 | Epoch + 序号窗口 | 序号 + 窗口 |

DTLS 在 TLS 记录/握手之上增加了「Epoch/序列号 + 重传定时器 + 无状态 Cookie」以适配无连接传输，但分层哲学一致；SSH 则不区分记录/握手，认证与传输耦合更紧，且每个通道独立加解密。

## 六、常见误区

误区一：TLS 在 IP 层。错，它在传输层之上、应用层之下（TCP → TLS → HTTP）。

误区二：TLS 1.3 与 1.2 仅差补丁。错，1.3 大幅简化、默认加密握手、移除弱算法。

误区三：记录层负责密钥交换。错，那是握手层职责。

误区四：记录层分片可任意大。错，单记录上限 $2^{14}$ 字节，过大需分片。

误区五：AEAD 的 nonce 可随机复用。错，同一密钥下 nonce 必须唯一，否则灾难性密钥流复用。

误区六：压缩能省带宽无风险。错，压缩会使明文长度依赖秘密（CRIME/BREACH），TLS 1.3 已移除。

误区七：记录层只管加密不管重放。错，序号检查同时提供新鲜性，缺失它会让重放旧记录成为可能。

## 七、与开源书·权威来源对应

- RFC 8446 §1「Overview」与 §5「Record Protocol」描述分层与 AEAD 封装，并强调 (key, nonce) 唯一性。
- RFC 6347 定义 DTLS 如何把 TLS 适配到 UDP（重传、抗重放、无状态 Cookie）。
- Stevens《TCP/IP Illustrated》卷 1 给出 TCP/TLS 在协议栈中的位置与封装关系。
- Kurose & Ross 第 8 章用图示说明 TLS 记录与握手的关系。
- Hennessy & Patterson 在体系结构中讨论加密指令与硬件加速，可与 AEAD 实现类比。

## 八、面试题

1. TLS 分哪两层？各自职责？要点：记录层（分片/加密/认证）与握手层（协商/密钥/认证）。
2. TLS 1.3 相比 1.2 移除了哪些？要点：RSA 密钥传输、静态 DH、CBC/RC4、压缩。
3. 为什么记录层用 AEAD 而非「加密 + 独立 MAC」？要点：AEAD 把加密与认证统一，避免如 BEAST/Lucky13 这类针对分离 MAC 的攻击。
4. 为什么 nonce 复用对 AEAD 是灾难？要点：同一 (key,nonce) 加密两份明文会暴露异或关系，直接破坏语义安全。
5. 记录层序号除了防重放还有什么作用？要点：它把「完整性」与「新鲜性」统一到一处，缺失则重放旧记录可操纵上层状态。
6. 为什么 TLS 1.3 把内容类型内移到加密载荷？要点：避免明文头暴露上层语义与长度特征，减少长度侧信道与跨层推断风险。

## 九、演进与趋势

TLS 1.3 已成主流；Encrypted Client Hello（ECH）把记录层明文头里的 SNI 也加密；DTLS 1.3 与 QUIC 把 TLS 握手直接嵌入传输层，复用同一套密钥调度；后量子 TLS（ML-KEM，hybrid）正通过扩展并入 1.3，继续沿「记录层加密 + 握手层协商」的分层范式演进。记录层未来还可能支持更大的分片与 0-RTT 记录聚合以进一步优化延迟。

另一条演进方向是「分层边界的进一步模糊」：当握手消息本身也被记录层封装后，握手层与记录层的实现往往合并为统一的「安全传输引擎」，对外只暴露「读写应用数据」的接口。这种抽象便于在 QUIC 等新传输上复用，但也要求实现者心里始终保留两层职责的区分，否则容易在密钥切换点与序号检查上出错。

## 十、小结

TLS 以「记录层加密 + 握手层协商」构成位于 TCP 与 HTTP 之间的安全传输层。TLS 1.3 用 AEAD 统一加密与认证、默认加密握手、移除弱算法，是其现代形态的安全基石。理解两层职责边界与 (key, nonce) 唯一性约束，是正确实现与排查 TLS 问题（如 record overflow、decrypt_error）的前提；而「序号检查兼管新鲜性」这一细节，是抗重放能力的实际落点。
