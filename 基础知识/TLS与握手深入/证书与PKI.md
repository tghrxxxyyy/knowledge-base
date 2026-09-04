# 证书与PKI

> 对应 RFC 5280（X.509）；RFC 6962（Certificate Transparency）。

## 一、背景与挑战
密钥交换建立共享秘密，但仍需确认“对面真的是声称的域名”。公钥基础设施（PKI）用可信第三方（CA）签发证书，将域名与公钥绑定。

## 二、核心原理
证书是 CA 用其私钥对（主体、公钥、有效期、序列号等）的签名（X.509 v3）。客户端用预置根证书公钥验证证书链：终端实体证书 ← 中间 CA ← 根 CA。域名验证用 SAN（Subject Alternative Name）。

## 三、形式化 / 数学基础
签名：$Sig = Sign_{CA\_priv}(Hash(tbsCertificate))$（如 RSA-PKCS#1 v1.5 或 ECDSA）。
验证：$Verify_{CA\_pub}(Hash(tbs), Sig) == true$。
链验证：$\forall i,\ Sign_{CA_i\_priv}(cert_{i+1}) \xrightarrow{verify} CA_i\_pub$，直至信任锚（根）。

## 四、代码实现
```python
from cryptography import x509
cert = x509.load_pem_x509_certificate(pem)
# 验证签名（用签发者公钥）
issuer_pub = issuer_cert.public_key()
issuer_pub.verify(cert.signature,
                  cert.tbs_certificate_bytes,
                  padding.PKCS1v15(), cert.signature_hash_algorithm)
```

## 五、与其他技术对比
PKI 中心化信任 vs Web of Trust（PGP 去中心化）；vs 证书透明度（CT）用公开日志审计防恶意签发；vs 本地 Pinning（HPKP 已弃用）。

## 六、常见误区
误区一：有证书就安全。错，还需校验链、有效期、撤销状态、域名匹配。误区二：自签名证书不可用。错，仅缺信任锚，内网可用。误区三：CN 字段用于域名校验。错，现代用 SAN。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 5280（X.509）、RFC 6962（CT）、Kurose & Ross 第 8 章。

## 八、面试题
1. 证书链如何验证？2. 为什么 SAN 取代 CN？

## 九、演进与趋势
证书透明度普及、ACME（RFC 8555，Let's Encrypt）自动化签发、短期证书减少撤销依赖。

## 十、小结
PKI 用 CA 签名证书把域名绑定公钥，客户端沿信任链验证，是 TLS 身份认证的基础。
