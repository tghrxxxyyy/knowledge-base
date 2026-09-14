# 会话管理与Cookie安全

> 对应 RFC 6265（HTTP State Management Mechanism）；OWASP Session Management Cheat Sheet；OWASP CSRF Prevention Cheat Sheet；OWASP Top 10 A07（Identification and Authentication Failures）。

## 一、背景与挑战

HTTP 本身无状态，认证后的「已登录」状态依赖会话机制承载。核心资产是会话标识（Session ID）：一旦被窃取或预测，攻击者即可完全冒充用户。泄露途径包括 XSS 读取 Cookie、明文信道嗅探、会话固定（攻击者预先植入已知 ID 再诱使用户登录）、以及 Cookie 属性配置不当导致的跨站携带。挑战在于：Session ID 必须高熵且不可预测，Cookie 必须限定作用域与传输条件，会话必须有明确生命周期，且注销要真正使服务端状态失效而非仅清客户端。此外，多标签页、长连接与移动端后台切换都会让「会话时效」的判定比想象中复杂。

## 二、核心原理

登录成功后，服务端生成高熵随机的 Session ID（或签名令牌），与其状态绑定；客户端通过 Cookie 携带。关键属性：`HttpOnly` 阻止脚本读取（缓解 XSS 窃取）、`Secure` 限定仅 HTTPS 传输（防嗅探）、`SameSite` 限制跨站请求携带（缓解 CSRF）、`Path`/`Domain` 收窄作用域、`Max-Age`/`Expires` 控制时效。现代浏览器还提供 `__Host-`/`__Secure-` 前缀，强制 Cookie 必须满足 `Secure`、`Path=/` 且不带 `Domain`，可抵御子域写入同名 Cookie 的攻击。防会话固定要求在认证成功时重新生成 Session ID（session rotation）。注销须服务端删除/失效会话记录，客户端清 Cookie 只是辅助。

## 三、形式化与数学基础

Session ID 的熵以位数衡量，暴力猜测单个会话的成功概率为：

$$ P_{guess} = \frac{1}{2^{H}} $$

当 $H \ge 128$ bit 时，任意实际攻击窗口内猜中概率可忽略。若 ID 由 $b$ 位随机源生成且使用 $k$ 个字符的字母表，则需 $k^L \ge 2^b$ 才能达到目标熵，$L$ 为 ID 长度。会话并发风险还可用「有效窗口」刻画：设会话时效为 $T$、注销延迟为 $\Delta$，则吊销后仍可被利用的最大时长为 $T_{risk} = \Delta$，故缩短 $T$ 与显式服务端失效共同压低风险。CSRF 防护的判据是请求是否携带浏览器自动附加的凭证：

$$ allow(req) \iff trusted(site_{req}) \lor token_{req} = session\_token $$

由于令牌不由浏览器自动附加，跨站页面无法凭空构造，从而把「自动携带凭证」的漏洞堵住。

## 四、代码实现

```python
# 安全 Cookie 设置与会话轮换（Flask 风格）
import secrets

def login(resp, user):
    sid = secrets.token_urlsafe(32)                 # 256 bit 熵，远超 128 bit 下限
    store.put(sid, {"uid": user.id, "t": now()})    # 服务端保存会话状态
    resp.set_cookie(
        "sid", sid,
        httponly=True,          # 禁止 JS 读取，缓解 XSS 窃取
        secure=True,            # 仅 HTTPS 传输
        samesite="Lax",         # 限制跨站携带，缓解 CSRF
        path="/", max_age=1800, # 30 分钟
    )
    return resp

def logout(req, resp):
    store.delete(req.cookies["sid"])                # 关键：服务端真正失效
    resp.delete_cookie("sid", path="/")
```

若使用 `__Host-sid` 作为名称，浏览器会拒绝不满足 `Secure + Path=/ + 无 Domain` 的写入，进一步压缩子域攻击面。

## 五、与其他技术对比

| 维度 | 服务端会话 + Cookie | JWT（无状态） | 签名 Cookie | 客户端存储 Token |
| --- | --- | --- | --- | --- |
| 状态位置 | 服务端存储 | 令牌自包含 | Cookie 自包含 | 前端存储 |
| 吊销能力 | 强（删记录即失效） | 弱（需黑名单） | 中（依赖短期有效） | 弱 |
| 横向扩展 | 需共享存储 | 天然无状态 | 天然无状态 | 天然无状态 |
| XSS 窃取风险 | 低（HttpOnly） | 中 | 低（HttpOnly） | 高（JS 可读） |
| CSRF 风险 | 有（需 SameSite/Token） | 取决于放置位置 | 有 | 低（非自动携带） |
| 适用场景 | 传统 Web 会话 | 微服务/API 网关 | 中等规模 Web | 移动端/SPA |

## 六、常见误区

1. 缺少 `HttpOnly`：XSS 可直接读取 `document.cookie`，会话被完整窃取。
2. 认为 `SameSite` 默认可靠：旧浏览器默认行为宽松，必须显式设置。
3. 会话永不失效：长期有效会话大幅放大泄露后的窗口，应设短时效并配合滑动续期。
4. 登录时不轮换 Session ID：导致会话固定攻击成立。
5. 注销只清 Cookie：服务端会话仍可被已窃取的 ID 继续使用。
6. 把 Session ID 放进 URL 或日志：会通过 Referer、代理日志等渠道泄露。
7. 只依赖 `SameSite` 防 CSRF：它并非所有浏览器与场景都可用，关键操作仍应校验同步令牌。

## 七、与开源书·权威来源对应

- RFC 6265 定义 Cookie 的读写、作用域与过期语义，是属性设计的规范依据。
- OWASP Session Management Cheat Sheet 给出 Session ID 生成、轮换与注销的实践清单。
- OWASP CSRF Prevention Cheat Sheet 讨论 SameSite 与同步令牌模式。
- OWASP Top 10 A07 把身份认证失效列为高风险类别。
- 具体属性与浏览器默认行为，以规范与主流浏览器最新文档为准。

## 八、面试题

1. `HttpOnly`、`Secure`、`SameSite` 各防什么？——依次防脚本读取、明文嗅探、跨站请求伪造。
2. 会话固定如何防御？——认证成功时重新生成 Session ID，并拒绝使用客户端提交的既有 ID。
3. 为什么 Session ID 需要 128 bit 以上熵？——使暴力猜测概率 $2^{-128}$ 量级可忽略。
4. 服务端会话与 JWT 在吊销上的差异？——前者删记录即失效，后者需黑名单或依赖短时效。
5. 为什么注销必须服务端失效？——否则已窃取的 ID 在时效内仍可继续访问。

## 九、演进与趋势

浏览器默认策略在收紧：`SameSite` 默认值趋严、第三方 Cookie 逐步退出，推动联合登录转向 FedCM 等中介方案。设备绑定、持续认证（continuous authentication）与令牌绑定（token binding）被用于把会话与终端特征关联。具体行为以主流浏览器与规范最新版本为准。

另一个趋势是「会话即凭证」的边界模糊化：短期访问令牌加刷新令牌的组合，把长期凭证从浏览器移到受控存储，从而在保留吊销能力的同时减少 Cookie 暴露面。

其代价是刷新令牌本身成为高价值目标，必须配合轮换、绑定与重用检测。

## 十、小结

会话安全依赖三件事：高熵且可轮换的 Session ID、配置正确的 Cookie 属性、以及服务端可控的生命周期与真实注销。任何一环缺失，认证强度都会被会话层面的漏洞抹平。
