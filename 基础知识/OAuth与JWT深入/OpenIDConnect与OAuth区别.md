# OpenIDConnect与OAuth区别

> 对应 OpenID Connect Core 1.0 / RFC 6749 / RFC 7519。

## 一、背景与挑战
OAuth2.0 是授权协议(代表用户访问资源)，并非认证协议。直接用它做登录会缺失身份语义。OIDC 在 OAuth 上叠加认证层。

## 二、核心原理
OIDC 增加 `scope=openid`，授权服务器返回 `id_token`(JWT) 携带认证声明(sub/iss/aud/auth_time)。OAuth 仅给 access_token 用于调用 API；OIDC 用 id_token 证明"用户已认证"。

## 三、形式化与数学基础
OIDC 认证判定：
$$ AuthN = Verify(id\_token) \land iss \in Trusted \land aud = client \land now \in [iat,exp] $$
OAuth 授权判定仅：
$$ Access = Verify(access\_token).scope \supseteq required $$

## 四、代码实现
```python
# OIDC 用 id_token 登录, OAuth 用 access_token 调 API
id_token = oauth_callback()["id_token"]
user = jwt.decode(id_token, OIDC_PUB, audience=CID)  # 认证
# 之后用 access_token 访问资源服务器
api_call(access_token)
```

## 五、与其他技术对比
OAuth=授权，OIDC=认证+授权。SAML 也做认证但重 XML；OIDC 轻量 JSON 适合 Web/移动。

## 六、常见误区
把 access_token 当身份(sub 可能不存在)。忽略 id_token 的 aud/iss 校验致混淆攻击。

## 七、与开源书/权威来源对应
OIDC Core 1.0；RFC 6749/7519；CyC2018/CS-Notes 区别章节。

## 八、面试题
OAuth 与 OIDC 核心区别？id_token 作用？为何 OAuth 不能直接登录？

## 九、演进与趋势
FedCM 浏览器原生身份联合；Passkey 替代密码与 OIDC 密码流。

## 十、小结
OAuth 管授权、OIDC 在其上管认证，id_token(JWT) 提供可信身份声明，二者职责分明。
