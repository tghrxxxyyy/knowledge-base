# OAuth常见漏洞

> 对应 RFC 9700（OAuth 2.0 Security BCP）；OWASP Top 10（A01 失效访问控制 / A07 认证失效）；RFC 6749；RFC 7636（PKCE）。

## 一、背景与挑战

OAuth 2.0 是一个「框架」而非「开箱即用的安全方案」——它把大量安全决策留给实现者（redirect_uri 怎么校验、state 是否用、token 怎么存）。结果统计上绝大多数 OAuth 相关事故都来自**配置/实现错误**而非协议本身缺陷：开放重定向泄露授权码、缺失 state 致账号被 CSRF 绑定、隐式流程把 token 暴露到浏览器、JWT 不验签名、refresh 不轮换等。理解这些高频漏洞模式，是安全集成 OAuth 的前提；这也是 OWASP 与 RFC 9700 反复强调「按最佳实践落地」的原因。

## 二、核心原理

典型漏洞可归类为几类：

1. **redirect_uri 校验不严**：若只前缀匹配或允许任意子域，攻击者可注册相似回调或用开放重定向把 `code` 引到自己的端点，兑换后访问受害者资源。
2. **state 缺失或不可预测**：state 用于把回调绑回用户会话，缺失则攻击者可用自己的 code 诱导受害者「登录到攻击者账号」（账号绑定/CSRF）。
3. **误用 implicit 流程**：implicit 把 `access_token` 直接塞进 URL fragment，易落入浏览器历史、referrer、日志，已被废弃。
4. **JWT/令牌验证缺失**：不校验签名算法（允许 `alg=none`）、不校验 `aud`/`iss`/`exp`，或弱 HMAC 密钥被爆破，导致令牌伪造。
5. **refresh 不轮换**：长期静态 refresh 一旦泄露即长期失陷（见令牌刷新主题）。
6. **scope 过度授予**：申请远超所需的权限，扩大泄露后影响面。

这些漏洞共同点是「偏离 RFC 9700 最佳实践」，因此防护的核心就是逐条对照 BCP 落地。

## 三、形式化与数学基础

redirect_uri 必须精确属于注册集合（或受控精确前缀），形式化为：

$$ received\_uri \in RegisteredSet $$

state 应不可预测且与会话绑定：

$$ H(state) \text{ 跨会话独立} \;\land\; state_{resp} = state_{req} $$

JWT 验签必须白名单算法并校验声明：

$$ alg \in AllowList \;\land\; Verify(pub/secret, sig)=true \;\land\; aud=client \;\land\; iat \le now \le exp $$

PKCE 校验（公共客户端）：`SHA256(submitted_verifier) == stored_challenge`。任一等式不成立即拒绝，这是把「协议层要求」转为「可机器校验的不变量」。

## 四、代码实现

下面给出回调里的安全校验骨架（防 CSRF + 防开放重定向 + 弃用 implicit）：

```python
from urllib.parse import urlparse

ALLOWED = {"https://app.example.com/callback"}

def callback(code, state, redirect_uri, session_state):
    # 1) 防 CSRF：state 必须与会话一致
    if not consteq(state, session_state):
        return 403
    # 2) 防开放重定向：redirect_uri 必须精确命中注册项
    netloc = urlparse(redirect_uri).netloc
    if redirect_uri not in ALLOWED or netloc not in ALLOWED_NETLOC:
        return 400
    # 3) 只用授权码 + PKCE 换 token，绝不用 implicit 的 URL fragment token
    token = exchange_code(code, verifier)
    return token
```

## 五、与其他技术对比

| 漏洞类型 | 性质 | 缓解 |
| --- | --- | --- |
| redirect_uri 不严 | 配置缺陷 | 精确匹配注册项 |
| state 缺失 | 实现缺陷（CSRF） | 随机不可预测 state |
| implicit 流程 | 协议误用 | 改用授权码 + PKCE |
| 令牌不验签 | 实现缺陷 | 白名单算法 + 校验声明 |
| refresh 不轮换 | 实现缺陷 | 轮换 + 重用侦测吊销 |

这些属「配置/实现」缺陷，不同于「协议理论弱点」；OAuth Security BCP 把最佳实践汇总成可对照清单。OIDC 还有专属漏洞（如 `sub` 混淆、`aud` 不校验），与 OAuth 漏洞同源。

## 六、常见误区

误区一：「用了 OAuth 就安全」。错——配置错误照样导致账号接管，`code` 泄露与 state 缺失是重灾区。

误区二：仍用 implicit 流程图省事。错——implicit 把 token 暴露到前端，已被 OAuth 2.1/BCP 废弃。

误区三：忽略 state 只图快。错——state 缺失直接打开 CSRF/账号绑定攻击面。

误区四：JWT 验签可有可无。错——不验签或允许 `alg=none` 等于「谁都能伪造任意身份」，是最高危错误。

## 七、与开源书·权威来源对应

- RFC 9700（OAuth 2.0 Security BCP）系统列出 redirect_uri 校验、state、PKCE、令牌存储等最佳实践，是防护的总纲。
- OWASP Top 10 的 A01（失效访问控制）与 A07（认证失效）覆盖此类误配置导致的越权与认证绕过。
- 图解网络（xiaolincoder/hello-http）的 OAuth 漏洞篇给出具体攻击时序。
- RFC 6749 是基线，RFC 7636 补齐 PKCE。

## 八、面试题

1. redirect_uri 不严的后果？要点：开放重定向/相似回调泄露 `code`，攻击者可兑换并访问受害者资源；必须精确匹配。
2. state 防什么？要点：防 CSRF 与账号绑定攻击，随机不可预测并在回调比对。
3. implicit 为何被废弃？要点：token 进 URL fragment，易入历史/referrer/日志被窃取。
4. 如何避免 JWT 伪造？要点：白名单算法（禁 none）、严格校验 `aud`/`iss`/`exp`、用高熵或公非对称密钥。

## 九、演进与趋势

OAuth 2.1 把 BCP 的最佳实践「升格为强制要求」：授权码 + PKCE 必选，implicit/password 废弃。PAR（RFC 9126）与 JAR（RFC 9101）把授权参数推送到服务端或用签名 JWT 承载，减少参数在重定向中的暴露。DPoP（RFC 9449）把令牌绑定到客户端密钥，即使 token 泄露也无法被第三方重放。

## 十、小结

OAuth 安全取决于正确配置而非协议本身：严格校验 `redirect_uri` 与 `state`、弃用 implicit、用 PKCE 护 code、严格验签并校验 JWT 声明、refresh 轮换吊销。逐条对照 RFC 9700 BCP 落地，是避免账号接管类事故的关键。
