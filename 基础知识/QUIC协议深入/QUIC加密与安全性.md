# QUIC加密与安全性

> 对应 RFC 9001 (Using TLS to Secure QUIC, IETF 2021) 与 RFC 9000 §12。

## 一、背景与挑战
TCP 头部明文易被中间盒篡改（如重置攻击、协议僵化）。QUIC 将加密贯彻到几乎所有头部，仅保留少量明文字段用于路由。

## 二、核心原理
QUIC 使用 TLS 1.3 派生多组密钥：早期数据密钥（0-RTT）、初始密钥、握手密钥、1-RTT 密钥。包号与帧均加密，仅 DCID/SCID、版本、长度明文。

## 三、形式化与数学基础
密钥派生（TLS 1.3 HKDF 链）：
  read_key = HKDF-Expand-Label(master_secret, "quic key", "", keylen)
  read_iv  = HKDF-Expand-Label(master_secret, "quic iv", "", ivlen)
AEAD 加密：
  ciphertext = AEAD_Encrypt(key, nonce=iv XOR pn, plaintext, aad)

## 四、代码实现
// 伪代码：1-RTT 包加密
void quic_encrypt_1rtt(quic_pkt *p, u8 *key, u8 *iv) {
    u8 nonce[12];
    xor_nonce(nonce, iv, p->pn);            // iv XOR pn
    aead_seal(key, nonce, p->payload, p->aad, p->ct);
}

## 五、与其他技术对比
TLS over TCP 仅加密负载，QUIC 还加密包号与大部分头部，抗探测与篡改更强。

## 六、常见误区
1. 认为 QUIC 不需要证书——仍依赖 TLS 1.3 PKI。
2. 认为 0-RTT 加密即安全——仍可被重放。

## 七、与开源书/权威来源对应
- RFC 9001 (TLS over QUIC)
- RFC 9000 §12
- Kurose & Ross《Computer Networking》（安全章）

## 八、面试题
QUIC 加密了哪些字段？为何抗协议僵化？0-RTT 安全边界？

## 九、演进与趋势
后量子密钥交换（Hybrid KEM）正被讨论纳入 QUIC 握手。

## 十、小结
QUIC 以 TLS 1.3 为底座、加密头部为手段，在传输层原生实现机密性与完整性。
