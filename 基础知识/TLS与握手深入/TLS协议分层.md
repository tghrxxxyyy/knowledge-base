# TLS协议分层

> 对应 RFC 8446（TLS 1.3）；RFC 5246（TLS 1.2）。

## 一、背景与挑战
应用层（HTTP）需要机密性、完整性、身份认证，但 TCP 是明文传输。TLS 在传输层与应用层之间插入安全层，对应用数据透明加密。

## 二、核心原理
TLS 分为两层：(1) 记录层（Record Layer）负责分片、压缩（已废弃）、加密/认证、MAC；(2) 握手层（Handshake）负责协商密码套件、密钥交换、身份认证。TLS 1.3 还把大部分握手消息加密（EncryptedExtensions）。

## 三、形式化 / 数学基础
记录层帧：$ContentType(1)\ |\ LegacyVersion(2)\ |\ Length(2)\ |\ Inner\ (加密\ plaintext\ =\ ContentType' + Version + Fragment)$。
AEAD 密文：$C = AEAD_{enc}(key, nonce, plaintext, additional\_data)$，如 AES-128-GCM、ChaCha20-Poly1305。TLS 1.3 移除 RSA 密钥传输、CBC、RC4、压缩。

## 四、代码实现
```c
// 记录层写入（伪）：AEAD 封装
aead_seal(key, nonce,
          plaintext,            // 应用数据
          aad = header,         // 附加认证数据
          &ciphertext);         // 输出含 tag
```

## 五、与其他技术对比
TLS 分层 vs SSH 单协议：TLS 关注“传输安全”，分记录/握手清晰；DTLS（RFC 6347）是 TLS 的 UDP 版，为 QUIC 前身之一。

## 六、常见误区
误区一：TLS 在 IP 层。错，在传输/应用之间（通常是 TCP 之上是 TLS，再上是 HTTP）。误区二：TLS 1.3 与 1.2 仅差补丁。错，1.3 大幅简化、默认加密握手、移除弱算法。误区三：记录层做密钥交换。错，那是握手层。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- CS-Notes：https://github.com/CyC2018/CS-Notes
- RFC 8446、RFC 5246、Kurose & Ross 第 8 章（安全）。

## 八、面试题
1. TLS 分哪两层？2. TLS 1.3 相比 1.2 移除了什么？

## 九、演进与趋势
TLS 1.3 已成主流；后量子 TLS（Kyber/ML-KEM，RFC 9180/证书体系）正在标准化。

## 十、小结
TLS 以记录层加密 + 握手层协商构成安全传输层，TLS 1.3 是其现代形态。
