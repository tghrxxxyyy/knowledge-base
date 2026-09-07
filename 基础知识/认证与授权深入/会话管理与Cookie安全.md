# 会话管理与Cookie安全

> 对应 OWASP Session Management Cheat Sheet / RFC 6265 (Cookie)。

## 一、背景与挑战
认证后得到会话，若会话标识(Session ID)被窃取或固定，攻击者可冒充用户。Cookie 属性配置不当是常见泄露途径。

## 二、核心原理
登录后服务端签发随机高熵 Session ID 或签名令牌；Cookie 置 `HttpOnly`(防 JS 读)、`Secure`(仅 HTTPS)、`SameSite`(防 CSRF)、短 `Max-Age`。会话应可注销并绑定 IP/UA 异常检测。

## 三、形式化与数学基础
Session ID 熵需足够抵抗暴力：
$$ N = 2^{bits},\ bits \ge 128 $$
猜测单会话概率：
$$ P = \frac{1}{N} \ll 可接受阈值 $$

## 四、代码实现
```python
# 安全 Cookie 设置(Flask 风格)
resp.set_cookie(
    "sid", value=sid,
    httponly=True, secure=True,
    samesite="Lax", max_age=1800   # 30 分钟
)
# 注销: 服务端置失效 + 清 Cookie
```

## 五、与其他技术对比
服务端会话状态强可控但需存储；JWT 无状态但撤销难。Cookie 属性控制横向(CSRF/XSS)泄露。

## 六、常见误区
缺 HttpOnly 致 XSS 窃 session。SameSite 不设默认宽松(旧浏览器)。会话永不失效。

## 七、与开源书/权威来源对应
OWASP Session Mgmt；RFC 6265；CSAPP Web 安全背景。

## 八、面试题
HttpOnly/Secure/SameSite 作用？Session 固定如何防？为何短时效？

## 九、演进与趋势
SameSite=Strict 默认化；设备绑定与持续认证；Token 绑定。

## 十、小结
会话管理靠高熵 ID + 安全 Cookie 属性 + 可控生命周期，防止标识窃取与固定攻击。
