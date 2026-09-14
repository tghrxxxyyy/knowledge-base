# JWT结构与签名机制

> 对应 RFC 7519（JSON Web Token）；RFC 7515（JWS）；RFC 7517（JWK）；OWASP JWT 安全备忘。

## 一、背景与挑战

在分布式系统中，服务间需要一种「自包含、可携带声明（claims）」的令牌，使资源服务器无需查库即可验证「谁、有什么权限、何时过期」。JWT（JSON Web Token）正是为此设计：它把声明编码进令牌本身并用签名保证完整性与来源可信。但 JWT 的安全性高度依赖正确的签名验证——历史上反复出现 `alg=none`（跳过验签）、把非对称算法当对称算法用导致密钥混淆、弱 HMAC 密钥被离线爆破等漏洞。理解其三段结构与签名校验流程，是安全使用 JWT 的前提。

## 二、核心原理

JWT 外观为 `header.payload.signature` 三段，每段都是 Base64URL 编码：

1. **Header**：JSON，含 `alg`（签名算法，如 `HS256`/`RS256`/`ES256`）与 `typ=JWT`，有时含 `kid`（密钥标识）。
2. **Payload**：JSON，含标准注册声明：`sub`（主体）、`iss`（签发者）、`aud`（受众）、`exp`（过期）、`iat`（签发）、`nbf`（生效）、`jti`（令牌唯一 ID）；也可含自定义声明。Payload 仅编码、不加密，任何人都可解码读取，因此**绝不能放敏感明文**。
3. **Signature**：对 `Base64Url(header) + "." + Base64Url(payload)` 用指定算法签名，使任何篡改都会验签失败。

两类主流算法：`HS256`（HMAC-SHA256，对称，客户端与服务端共享密钥）适合单一受信方；`RS256`（RSASSA-PKCS1-v1_5 + SHA256，非对称）适合多资源服务器——授权服务器持私钥签发，资源服务器仅持公钥验签，密钥不必分发。

## 三、形式化与数学基础

签名构造：

$$ sig = \text{Sign}_{key}\big(\text{B64}(header) \parallel "." \parallel \text{B64}(payload)\big) $$

其中 `Sign` 为 HMAC（对称）或 RSA/ECDSA（非对称）。验证：

$$ \text{Verify}_{pub/secret}(sig,\ data) \stackrel{?}{=} true $$

时间声明校验：

$$ nbf \le now \le exp $$

安全性源于签名密钥的保密性与算法的正确选择：`HS256` 的安全性取决于共享密钥的高熵（应 $\ge 256$ bit 随机）；`RS256` 的安全性取决于私钥保密与公钥的正确绑定（通过 `kid` 与 JWK 集）。

## 四、代码实现

下面给出签发（`RS256`）与验证（资源服务器用公钥）的简化示例：

```python
import jwt, time, datetime

# 签发：授权服务器持私钥
token = jwt.encode(
    {"sub": "u1", "aud": "api1", "exp": int(time.time()) + 3600},
    key=PRIV_KEY, algorithm="RS256",
)

# 资源服务器：用公钥验签并强制校验声明
claims = jwt.decode(
    token, PUB_KEY,
    algorithms=["RS256"],     # 显式限定算法，禁用 none
    audience="api1",          # 校验 aud 防错配
    issuer="https://auth.example.com",
)
```

注意 `algorithms` 必须显式传入白名单——这正是规避 `alg=none` 与算法混淆攻击的关键。

## 五、与其他技术对比

| 维度 | JWT | 服务端会话（session） |
| --- | --- | --- |
| 状态 | 无状态、自包含 | 有状态、需查库/缓存 |
| 吊销 | 难（需额外机制） | 易（删服务端记录） |
| 扩展 | 多资源服务器友好 | 需共享会话存储 |
| 机密 | payload 明文可读 | 服务端存放 |

`HS256` 共享密钥在「多独立资源服务器」场景难分发、易泄露；`RS256` 公钥验签更适合分布式。`ES256`（ECDSA）则比 `RS256` 签名更短更快。

## 六、常见误区

误区一：用 `alg=none` 方便调试。错——这会让任何人伪造任意声明，生产必须禁用，验签时必须白名单算法。

误区二：把未验签的 payload 当可信。错——payload 只是 Base64Url 编码，攻击者可直接篡改，必须先验签再信任。

误区三：弱 `HS256` 密钥。错——短/可猜的共享密钥会被离线爆破，应使用高熵随机密钥或改用非对称。

误区四：不校验 `exp`/`aud`。错——不校验 `exp` 致令牌永久可用（重放），不校验 `aud` 致令牌被错配到其他服务。

## 七、与开源书·权威来源对应

- RFC 7519 定义 JWT 的三段结构、注册声明与时间语义。
- RFC 7515（JWS）规定签名的计算方式与 `alg` 处理（含 `none` 的安全警告）。
- RFC 7517 定义 JWK，供授权服务器发布公钥供 `RS256` 验签。
- OWASP 的 JWT 备忘列出 `alg=none`、密钥混淆、弱密钥等常见漏洞与防护。
- 图解网络（xiaolincoder/hello-http）与 CS-Notes 有面向工程者的 JWT 图解。

## 八、面试题

1. JWT 三段各是什么？要点：header（算法/类型）、payload（声明）、signature（签名）；均 Base64Url。
2. `RS256` 与 `HS256` 区别？要点：RS256 非对称（私钥签、公钥验，适合多资源服务器）；HS256 对称（共享密钥）。
3. `alg=none` 风险？要点：跳过验签，攻击者可伪造任意声明，必须白名单禁用。
4. 为何 payload 不能放敏感信息？要点：payload 仅编码不加密，任何人可解码读取。

## 九、演进与趋势

DPoP（OAuth DPoP，RFC 9449）把 JWT 与客户端密钥绑定，使令牌即便泄露也无法被他人重放；JWE（RFC 7516）提供 payload 加密（JWT 默认仅签名不加密）；短期令牌 + 刷新轮换成为主流，配合 JWK 轮换（`kid`）实现无停机密钥更新。

## 十、小结

JWT 以「签名保证声明完整性与来源」实现无状态、自包含的令牌，`RS256` 适合分布式验签。但安全全系于正确的签名验证：必须白名单算法、严格校验 `exp`/`aud`/`iss`，绝不把 `alg=none` 或弱密钥带进生产。
