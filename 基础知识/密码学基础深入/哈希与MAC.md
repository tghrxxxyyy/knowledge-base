# 哈希与MAC

> 对应密码学哈希、HMAC 与消息认证码。

## 一、背景与挑战
哈希用于完整性校验与指纹；但仅哈希不能防篡改（攻击者可重算）。MAC（消息认证码）在密钥参与下同时保证完整性与真实性。

## 二、核心原理
- 密码学哈希（SHA-256/SHA-3）需抗碰撞、第二原像、原像抵抗。
- HMAC：以密钥与哈希构造，$HMAC_k(m)=H((k\oplus opad)\mathbin\| H((k\oplus ipad)\mathbin\| m))$。
- MAC 验证需恒定时间比较，防时序攻击。
- 哈希不等于加密：不可逆、不保密。

## 三、形式化 / 数学基础
- 抗碰撞：$\forall m_1\neq m_2,\ H(m_1)=H(m_2)$ 计算不可行。
- 原像抵抗：给定 $h$ 找 $m$ 使 $H(m)=h$ 不可行。
- HMAC 安全性归约到哈希的伪随机性。
- 比较：$strcmp$ 计时泄漏；须 `crypto_verify` 恒定时间。

## 四、代码实现
```python
from cryptography.hazmat.primitives import hmac, hashes
import hmac as hm
key = b"secret-key"
mac = hm.digest(key, b"message", hashes.SHA256())
# 恒定时间验证
valid = hm.compare_digest(
    mac, hm.digest(key, b"message", hashes.SHA256()))
```

## 五、与其他技术对比
- 哈希 vs MAC：哈希无密钥可伪造；MAC 需密钥。
- HMAC vs 直接 hash(secret||msg)：前者经证明安全，后者某些哈希下有长度扩展攻击风险。
- MAC vs 数字签名：MAC 需共享密钥（不可抵赖性弱），签名可公开验证。

## 六、常见误区
- 用普通哈希做完整性且未防篡改（应加密钥 MAC）。
- 用 `==` 比较 MAC 遭时序攻击。
- MD5/SHA1 仍用于安全场景（已被攻破，禁用）。

## 七、与开源书 / 权威来源对应
- Katz & Lindell《Introduction to Modern Cryptography》MAC 章。
- Schneier《Applied Cryptography》HMAC 章。

## 八、面试题
- MAC 与哈希区别？
- 为什么 MAC 比较要恒定时间？
- HMAC 的结构与作用？

## 九、演进与趋势
SHA-3（Keccak）提供结构不同的哈希；长度扩展攻击促使 HMAC 普及。

## 十、小结
哈希保证完整性但不防伪造，MAC/HMAC 以密钥提供认证，比较须恒定时间，禁用 MD5/SHA1。
