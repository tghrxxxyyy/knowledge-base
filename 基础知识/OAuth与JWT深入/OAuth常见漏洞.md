# OAuth常见漏洞

> 对应 OWASP / RFC 9700 (OAuth 2.0 Security BCP) / xiaolincoder/hello-http。

## 一、背景与挑战
OAuth 实现细节众多，错误配置即可致令牌泄露、账号被接管。理解常见漏洞是安全集成的前提。

## 二、核心原理
典型漏洞：redirect_uri 未严格校验致 code 泄露；state 缺失致 CSRF 绑定攻击者账号；implicit 流程 token 入浏览器历史/日志；未校验 JWT 算法；刷新令牌无轮换；scope 过度。

## 三、形式化与数学基础
redirect_uri 校验必须精确匹配(或注册前缀)：
$$ received \in RegisteredSet $$
state 应不可预测：
$$ H(state) \text{ 在会话间独立且 } state_{resp}=state_{req} $$

## 四、代码实现
```python
# 安全校验重定向与 state
def callback(code, state, sess_state):
    if state != sess_state:            # 防 CSRF
        return 403
    if urlparse(request.redirect_uri).netloc not in ALLOWED:
        return 400                     # 防开放重定向
    # 仅用 code 换 token, 不用 implicit
```

## 五、与其他技术对比
这些属配置/实现缺陷，不同于协议本身弱点；OAuth Security BCP 汇总最佳实践。与 OIDC 漏洞(如 sub 混淆)相关。

## 六、常见误区
认为"用了 OAuth 就安全"——配置错误照样崩。用 implicit 流程。忽略 state。

## 七、与开源书/权威来源对应
RFC 9700 Security BCP；OWASP；xiaolincoder/hello-http 漏洞篇。

## 八、面试题
redirect_uri 不严后果？state 防啥？implicit 为何弃？

## 九、演进与趋势
OAuth 2.1 统一最佳实践；PAR(请求对象)、JAR 减参数泄露。

## 十、小结
OAuth 安全取决于正确配置：严校验 redirect_uri 与 state、弃 implicit、用 PKCE，并校验令牌。
