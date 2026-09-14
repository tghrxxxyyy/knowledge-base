# PKCE扩展原理

> 对应 RFC 7636（Proof Key for Code Exchange）；RFC 6749（OAuth 2.0）；RFC 9700（OAuth 2.0 Security BCP）。

## 一、背景与挑战

OAuth 2.0 的授权码流程依赖 `client_secret` 向授权服务器证明「换 token 的确实是同一个客户端」。但「公共客户端」（native 移动 App、SPA 等纯前端应用）无法安全地存储 `client_secret`——它可能被逆向、被提取。于是攻击者只要截获一次性的 `authorization code`（例如通过恶意应用注册相同重定向 URI、或拦截明文信道），就能直接拿 code 去换 `access_token`，因为「没有 secret 可比对」。PKCE（发音「pixy」）正是为公共客户端设计的零密钥防护：用一次性的「挑战/验证值」把 `code` 与「发起授权的人」绑定，使截获 code 的攻击者因缺少 `code_verifier` 而无法兑换。

## 二、核心原理

PKCE 在授权码流程中插入一对临时密钥：

1. 客户端先生成高熵随机的 `code_verifier`（43–128 字符的 URL-safe 字符串）。
2. 计算 `code_challenge = BASE64URL(SHA256(code_verifier))`（推荐 S256 方法；也可 `plain` 但不安全）。
3. 授权请求中携带 `code_challenge` 与 `code_challenge_method=S256`。授权服务器把 challenge 与即将签发的 `code` 绑定存储。
4. 换 token 时，客户端提交原始 `code_verifier`；服务器重新计算 `SHA256(verifier)` 并与存储的 challenge 比对，一致才签发令牌。

由于 `code_verifier` 只存在于发起授权的客户端内存、从不经重定向传输，攻击者即便截获 `code` 与 `code_challenge`（challenge 是单向哈希，无法反推 verifier），也无法通过校验。这相当于给「无 secret 的公共客户端」补了一个「每次会话独有、且不在网络上完整出现」的等价证明。

## 三、形式化与数学基础

挑战构造（S256 方法）：

$$ challenge = \text{Base64UrlEncode}\big(\text{SHA256}(verifier)\big) $$

换 token 时的服务端校验：

$$ \text{SHA256}(submitted\_verifier) \stackrel{?}{=} \text{stored\_challenge} $$

安全性根源：SHA256 的抗原像性保证攻击者从公开信道截获的 `code` 与 `challenge` 无法反推出 `verifier`；且 `verifier` 每次授权重新生成（高熵），使「一次截获的 code」无法被复用。对比 `plain` 方法（challenge = verifier）则完全失去保护，应禁用。

## 四、代码实现

下面给出生成 verifier/challenge 与换 token 的简化实现：

```python
import hashlib, base64, secrets, requests

# 1) 生成高熵 verifier 与 S256 challenge
verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=")
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier).digest()).rstrip(b"=")

# 2) 授权请求携带 challenge
auth_url = (f"{AUTH}/authorize?response_type=code"
            f"&client_id={CID}&redirect_uri={REDIRECT}"
            f"&code_challenge={challenge.decode()}"
            f"&code_challenge_method=S256&state={STATE}")

# 3) 换 token 时提交原始 verifier
resp = requests.post(f"{AUTH}/token",
    data={"grant_type": "authorization_code",
          "code": code,
          "redirect_uri": REDIRECT,
          "client_id": CID,
          "code_verifier": verifier.decode()},   # 关键：出示原值
    verify=True)
```

## 五、与其他技术对比

| 机制 | 保护对象 | 是否需要 secret | 目标 |
| --- | --- | --- | --- |
| client_secret | 机密客户端 | 是 | 证明客户端身份 |
| PKCE | 公共客户端 | 否 | 绑定 code 与发起方 |
| state | 所有客户端 | 否 | 防 CSRF / 绑定会话 |

PKCE 与 `state` 互补而非替代：`state` 防 CSRF、把回调绑回用户会话；PKCE 防 `code` 被第三方截获兑换。机密客户端也可叠加 PKCE 作为纵深防御。

## 六、常见误区

误区一：PKCE 只用于移动端。错——OAuth 2.1 与 Security BCP 已推荐所有客户端（含 Web 后端）使用 PKCE，因为它同时缓解 `code` 注入。

误区二：用 `plain` 方法即可。错——`plain` 把 verifier 原样当 challenge，截获即失效，形同虚设，应只用 S256。

误区三：有 PKCE 就不需要 `state`。错——二者防护目标不同，仍应同时使用 `state` 防 CSRF。

误区四：PKCE 依赖 TLS 之外还要额外信道。错——PKCE 不要求额外信道，verifier 只在客户端本地保存、于 token 端点回传（已在 TLS 内）。

## 七、与开源书·权威来源对应

- RFC 7636 是 PKCE 的正式规范，定义 verifier/challenge 的生成、S256 方法与校验流程。
- RFC 9700（OAuth 2.0 Security BCP）把 PKCE 列为授权码流程的强制最佳实践。
- 图解网络（xiaolincoder/hello-http）对 PKCE 有逐步图解。
- RFC 6749 是 PKCE 所扩展的 OAuth 2.0 基线。

## 八、面试题

1. PKCE 解决什么问题？要点：公共客户端无 `client_secret`，`code` 被截获即可兑换令牌；PKCE 用 verifier/challenge 绑定 code 与发起方。
2. `verifier` 与 `challenge` 的关系？要点：challenge = Base64Url(SHA256(verifier))，verifier 本地保存、仅回传原值，攻击者可截 challenge 但无法反推。
3. 为什么公共客户端需要 PKCE？要点：无法安全存储 secret，传统证明机制失效，PKCE 提供零密钥等价保护。
4. 为何禁用 `plain`？要点：challenge 等于 verifier，截获即破解，失去单向哈希保护。

## 九、演进与趋势

OAuth 2.1 把「授权码 + PKCE」设为所有客户端的强制要求，并正式废弃 implicit 与 password 流程（RFC 9700）。PAR（Pushed Authorization Requests，RFC 9126）进一步把授权请求参数先推送到服务端、只传一次性的 `request_uri`，减少 `code_challenge` 等参数在重定向中的暴露面。

## 十、小结

PKCE 以「动态 challenge/verifier + 单向哈希」把授权码与发起客户端绑定，在不依赖 `client_secret` 的前提下消除公共客户端的截码风险。它是现代 OAuth 部署的必选项，与 `state` 互补、与 OAuth 2.1 的授权码流程深度融合。
