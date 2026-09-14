# OpenIDConnect与OAuth区别

> 对应 OpenID Connect Core 1.0；RFC 6749（OAuth 2.0）；RFC 7519（JWT）；RFC 7517（JWK）。

## 一、背景与挑战

OAuth 2.0 解决的是「授权」（authorization）：允许第三方应用代表用户去访问受保护资源（如用 Google 照片 API）。但它刻意不解决「认证」（authentication）——OAuth 的 `access_token` 携带的是「能访问什么」的授权信息，并不内含「这个用户是谁、是否已登录」的身份声明。很多团队却直接用 OAuth 做登录，结果出现「把 `access_token` 当身份」的反模式，导致混淆攻击（authorization code 注入、IdP 混淆）。OpenID Connect（OIDC）正是在 OAuth 2.0 之上叠加一层标准认证：用 `id_token`（一个 JWT）携带可验证的身份声明，让「你是谁」这件事有标准化、可校验的表达。

## 二、核心原理

OIDC 复用 OAuth 的授权码流程，但通过两点扩展把它升级为认证协议：

1. 请求中携带 `scope=openid`，向授权服务器声明「我要做认证」。授权服务器在返回 `access_token` 的同时，额外签发一个 `id_token`（JWT）。
2. `id_token` 是一段经签名的 JWT，含标准身份声明：`iss`（签发者）、`sub`（主体标识，即用户唯一 ID）、`aud`（受众，必须等于客户端 ID）、`exp`/`iat`（过期/签发时间）、`auth_time`（认证发生时刻）、`nonce`（防重放，由客户端生成并回传校验）。资源服务器用 `access_token` 调 API，客户端用 `id_token` 判断「用户已通过认证且身份为 sub」。

OAuth 与 OIDC 的核心分野一句话：**OAuth 回答「能不能访问」，OIDC 回答「是谁在访问」**。

## 三、形式化与数学基础

OIDC 认证判定（依赖对 `id_token` 的密码学验证与声明校验）：

$$ AuthN = \text{Verify}_{pubkey}(id\_token) \;\land\; iss \in TrustedIdPs \;\land\; aud = client\_id \;\land\; iat \le now \le exp \;\land\; nonce_{resp} = nonce_{req} $$

OAuth 授权判定仅验证令牌与作用域：

$$ Access = \text{Verify}(access\_token).\text{scope} \supseteq required\_scope $$

注意 `id_token` 的 `aud` 必须为客户端自身（而非资源服务器），这正是对抗「把 A 应用的 token 用到 B 应用」的混淆攻击的关键；`nonce` 绑定单次认证会话，防止 `id_token` 被重放复用。

## 四、代码实现

下面展示 OIDC 用 `id_token` 完成登录、再用 `access_token` 调 API 的简化流程：

```python
# OIDC 回调：用 id_token 做认证，用 access_token 调资源
import jwt

def handle_callback(params):
    # 1) 校验 state 防 CSRF（与授权请求一致）
    if params["state"] != session["state"]:
        raise AuthError("state mismatch")
    # 2) 解码并验证 id_token（验签 + 声明）
    id_token = jwt.decode(
        params["id_token"], OIDC_PUBKEY,
        algorithms=["RS256"],
        audience=CLIENT_ID,          # 必须匹配本客户端
        issuer=OIDC_ISSUER,
    )
    user = id_token["sub"]           # 身份主体
    # 3) 用 access_token 访问资源服务器
    profile = api_call(params["access_token"])
    return user, profile
```

## 五、与其他技术对比

| 协议 | 解决的问题 | 令牌 | 数据格式 | 典型场景 |
| --- | --- | --- | --- | --- |
| OAuth 2.0 | 授权（ delegated access） | access_token | 不透明/ JWT | 第三方调用 API |
| OIDC | 认证 + 授权 | id_token + access_token | JWT | 单点登录（SSO） |
| SAML 2.0 | 认证 + 授权 | Assertion | XML | 企业 SSO（传统） |

OIDC 相比 SAML 更轻量（JSON/JWT 而非 XML）、更适合 Web/移动端；SAML 仍常见于传统企业联邦。OAuth 单独使用时只应做授权，绝不能直接当登录协议。

## 六、常见误区

误区一：把 `access_token` 当身份。错——`access_token` 的 `sub` 语义不确定、受众是资源服务器，用它登录会引入混淆攻击。

误区二：忽略 `id_token` 的 `aud`/`iss` 校验。错——这是防止 IdP 混淆与令牌错配的基础，必须严格校验等于本客户端 ID 与可信 issuer。

误区三：OIDC 完全独立于 OAuth。错——OIDC 是 OAuth 的「认证层扩展」，复用其 flows（授权码 + PKCE 等），不是另起炉灶。

误区四：`nonce` 可选。错——`nonce` 绑定认证会话、防 `id_token` 重放，强烈建议启用。

## 七、与开源书·权威来源对应

- OpenID Connect Core 1.0 规范定义了 `scope=openid`、`id_token` 声明集合与认证判定流程。
- RFC 6749 是 OIDC 所依托的 OAuth 2.0 框架；RFC 7519 定义 `id_token` 所用的 JWT 结构。
- RFC 7517 定义 JWK（JSON Web Key），用于发布 IdP 公钥供 `id_token` 验签。
- 图解网络（xiaolincoder/hello-http）与 CS-Notes 对 OAuth/OIDC 区别有通俗讲解。

## 八、面试题

1. OAuth 与 OIDC 的核心区别？要点：OAuth 管授权、OIDC 在其上管认证；OIDC 额外返回 `id_token`（JWT 身份声明）。
2. `id_token` 的作用？要点：携带 `iss/sub/aud/exp` 等可验证身份声明，证明「用户已认证且身份为 sub」。
3. 为什么 OAuth 不能直接做登录？要点：`access_token` 只表达授权、无可靠身份语义，直接当登录会致混淆攻击。
4. `aud`/`nonce` 防什么？要点：`aud` 防令牌错配/IdP 混淆，`nonce` 防 `id_token` 重放。

## 九、演进与趋势

浏览器原生身份联合 FedCM（Federated Credential Management）正尝试把 OIDC 类流程内置到浏览器，减少第三方 Cookie 与重定向依赖；Passkey（WebAuthn/FIDO2）与 OIDC 结合，替代密码并弱化授权码流程中的密码因素；Token Binding / DPoP 则把令牌与客户端密钥绑定，进一步防重放与中间人。

## 十、小结

OAuth 管「授权」、OIDC 在其上管「认证」，`id_token`（JWT）提供经签名、带 `iss/sub/aud/exp/nonce` 的可信身份声明，二者职责分明。理解「OAuth 只授权、OIDC 才认证」以及 `aud`/`nonce` 的校验必要性，是正确集成单点登录的前提。
