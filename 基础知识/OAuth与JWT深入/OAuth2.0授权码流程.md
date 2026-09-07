# OAuth2.0授权码流程

> 对应 RFC 6749 (The OAuth 2.0 Authorization Framework) / xiaolincoder/hello-http (GitHub)。

## 一、背景与挑战
第三方应用需在用户授权下访问资源服务器(如用 Google 登录)，但绝不能拿到用户口令。授权码流程以中间授权服务器解耦，安全委派权限。

## 二、核心原理
流程：客户端重定向用户到授权服务器→用户登录并同意→授权服务器回重定向 URI 带 `code`→客户端用 code+client_secret 换 `access_token`→持 token 调资源服务器。code 短时有效且绑定重定向 URI。

## 三、形式化与数学基础
关键校验点：
$$ redirect\_uri \in registered \land state_{req} = state_{resp} \land code\_ttl < 10s $$
token Scope 限制权限集 $S \subseteq S_{granted}$。

## 四、代码实现
```python
# 授权码换 token(示意, 需 HTTPS + client_secret)
import requests
r = requests.post("https://auth.example.com/token",
    data={"grant_type":"authorization_code",
          "code": code,
          "redirect_uri": REDIRECT,
          "client_id": CID, "client_secret": SEC},
    verify=True)
access_token = r.json()["access_token"]
```

## 五、与其他技术对比
授权码比隐式流程(implicit)安全(令牌不暴露前端)；比密码模式安全(不碰用户口令)。PKCE 进一步护 code。

## 六、常见误区
把 access_token 当身份凭证(它只授权)。redirect_uri 未校验致泄露 code。code 无 state 防 CSRF。

## 七、与开源书/权威来源对应
RFC 6749 第4.1节授权码；xiaolincoder/hello-http OAuth 详解；CS-Notes。

## 八、面试题
授权码流程几步？为何不直接返 token？state 防什么？

## 九、演进与趋势
授权码+PKCE 成为 SPA/移动端推荐；隐式流程被弃。

## 十、小结
授权码流程通过短时 code 与后端换 token，实现安全委派，是 OAuth2 最主流模式。
