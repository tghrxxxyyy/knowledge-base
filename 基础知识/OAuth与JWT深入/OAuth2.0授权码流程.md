# OAuth2.0授权码流程

> 对应 RFC 6749（The OAuth 2.0 Authorization Framework）第4.1节；RFC 7636（PKCE）；RFC 9700（Security BCP）。

## 一、背景与挑战

第三方应用需要在「用户授权」的前提下访问资源服务器（如用 GitHub 登录、授权读取用户相册），但绝不能获取用户的用户名口令——否则应用可随时冒充用户、且口令一旦泄露影响面极大。OAuth 2.0 引入「授权服务器」作为可信中间人，把「用户的凭据」与「第三方的权限」解耦。授权码流程（Authorization Code Grant）是最经典、最安全的一种模式：它先把用户引导到授权服务器完成登录与同意，再用一个短时有效的 `code` 换取 `access_token`，令牌始终不直接暴露给浏览器/前端，从根本上降低泄露风险。

## 二、核心原理

完整流程分两大阶段、涉及四方（资源拥有者/用户、客户端、授权服务器、资源服务器）：

1. **授权阶段**：客户端把用户浏览器重定向到授权服务器 `/authorize`，带 `response_type=code`、`client_id`、`redirect_uri`、`scope`、`state`。用户在授权服务器登录并「同意授权」后，授权服务器把浏览器重定向回 `redirect_uri`，URL 中附带 `code`（授权码）与 `state`。
2. **兑换阶段**：客户端（通常是后端）用 `code` + `client_id` + `client_secret`（机密客户端）或 `code_verifier`（公共客户端，PKCE）向 `/token` 端点换取 `access_token`（及可选的 `refresh_token`）。此后客户端持 `access_token` 调资源服务器。

关键安全设计：`code` 短时有效（通常数秒到几分钟）且一次性、必须绑定 `redirect_uri` 与 `client_id`；`state` 是客户端生成的不可预测随机值，回调时比对以防御 CSRF；`access_token` 只经后端换取，不进浏览器历史/日志。

## 三、形式化与数学基础

授权请求与回调的绑定约束：

$$ redirect\_uri \in RegisteredSet \;\land\; state_{resp} = state_{req} \;\land\; code\_ttl < T_{short} $$

令牌作用域限制权限集合：实际授权 $S$ 必为请求作用域的子集：

$$ S \subseteq S_{granted} \subseteq S_{requested} $$

授权码与 `redirect_uri` 的绑定防止「开放重定向/code 泄露」：即使 `code` 被截获，若攻击者无法控制自己的 `redirect_uri` 注册项或不持有 `code_verifier`（PKCE），也无法兑换。PKCE 的校验见 `code_verifier → challenge` 一致。

## 四、代码实现

下面给出后端用 `code` 换取 `access_token` 的简化示例（机密客户端 + PKCE 并存）：

```python
import requests

def exchange_code(code, code_verifier):
    resp = requests.post(
        "https://auth.example.com/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT,           # 必须与授权请求完全一致
            "client_id": CID,
            "client_secret": SEC,               # 机密客户端
            "code_verifier": code_verifier,     # 公共客户端（PKCE）
        },
        verify=True,                             # 必须 HTTPS
    )
    resp.raise_for_status()
    return resp.json()["access_token"]
```

前端部分仅负责构造 `/authorize` 重定向并带回 `code`/`state`，绝不在前端保存 `client_secret`。

## 五、与其他技术对比

| 流程 | 令牌暴露面 | 适用客户端 | 现状 |
| --- | --- | --- | --- |
| 授权码 + PKCE | 后端换取，最小 | 所有（含公共） | 推荐（OAuth 2.1） |
| 隐式（implicit） | 浏览器直接拿 token | 纯前端 | 已废弃 |
| 密码模式（password） | 应用接触口令 | 高信任第一方 | 已废弃 |
| 客户端凭证（client_credentials） | 无用户 | 服务间 | 保留（机器对机器） |

授权码比隐式安全（令牌不暴露前端）、比密码模式安全（不碰用户口令）。PKCE 进一步保护 `code` 不被截获兑换。

## 六、常见误区

误区一：把 `access_token` 当身份凭证。错——它只表达授权（能访问什么），身份应来自 OIDC 的 `id_token`。

误区二：`redirect_uri` 不校验。错——未严格校验会让攻击者用开放重定向泄露 `code`，必须精确匹配注册项。

误区三：不用 `state`。错——`state` 缺失使回调可被 CSRF 绑定到攻击者账号，必须随机且不可预测。

误区四：前端也能安全用授权码。错——前端无法藏 `client_secret`，公共客户端必须改用 PKCE 而非 secret。

## 七、与开源书·权威来源对应

- RFC 6749 第4.1节完整定义授权码流程的端点、参数与错误处理。
- RFC 7636（PKCE）为公共客户端补强 code 保护；RFC 9700 把二者列为最佳实践。
- 图解网络（xiaolincoder/hello-http）有逐步时序图解；CS-Notes 有对照总结。

## 八、面试题

1. 授权码流程有哪几步？要点：重定向到 /authorize → 用户同意 → 回跳带 code → 后端用 code 换 token。
2. 为何不直接返回 token？要点：避免 token 进浏览器/历史/日志；用短时 code 经后端 HTTPS 换取更安全。
3. `state` 防什么？要点：防 CSRF 与回调绑定攻击，随机不可预测并在回调比对。
4. PKCE 在授权码流程里的角色？要点：公共客户端用 verifier/challenge 绑定 code，防截获兑换。

## 九、演进与趋势

OAuth 2.1 把「授权码 + PKCE」固化为唯一推荐的前端交互流程，正式废弃 implicit 与 password；PAR（RFC 9126）把授权参数先推送、只传 `request_uri` 以减少参数暴露；JAR（RFC 9101）用签名 JWT 承载授权请求参数，进一步防篡改与泄露。

## 十、小结

授权码流程通过「短时 `code` + 后端换 token」实现权限的安全委派，是 OAuth 2.0 最主流、最安全的模式。配合 `state` 防 CSRF、`redirect_uri` 严格校验与 PKCE 护 code，构成现代第三方登录的基石。
