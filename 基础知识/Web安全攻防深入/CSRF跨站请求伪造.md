# CSRF跨站请求伪造

> 对应跨站请求伪造（Cross-Site Request Forgery）与防御。

## 一、背景与挑战
CSRF 利用浏览器自动携带登录态 cookie 的特性，诱导已登录用户在不知情下发出非预期请求（转账、改密）。

## 二、核心原理
- 攻击：恶意页面自动提交表单/自动发请求到目标站，浏览器带上受害者的 cookie。
- 关键：请求自动携带身份凭证，且站点无法区分是否用户本意。
- 防御：CSRF Token（随表单的随机不可预测值，服务端校验）、SameSite Cookie、校验 Origin/Referer。
- 幂等 GET 不应有副作用（降低 CSRF 面）。

## 三、形式化 / 数学基础
- 合法请求须含 $token \sim \text{CSPRNG}$，攻击者无法预测（不可伪造性）。
- SameSite=Strict/Lax 阻止跨站请求携带 cookie。
- 双重提交：cookie 与请求体同 token 值，服务端比对（无需服务端存储）。
- 验证 $\text{Origin} \in \text{allowed\_origins}$ 拒绝跨源。

## 四、代码实现
```python
# Flask 风格 CSRF token 校验
@app.post("/transfer")
def transfer():
    if request.form.get("csrf") != session["csrf"]:
        abort(403)                 # 无/错 token 拒绝
    do_transfer(request.form["to"], request.form["amt"])
# 设置 SameSite
response.set_cookie("sid", val, samesite="Lax", httponly=True)
```

## 五、与其他技术对比
- CSRF vs XSS：CSRF 借身份发请求；XSS 直接执行脚本（XSS 可绕过 CSRF 防护）。
- Token vs SameSite：Token 通用；SameSite 现代浏览器默认 Lax 已缓解多数。
- Referer vs Origin：Origin 更可靠（不含路径）。

## 六、常见误区
- 仅依赖 Referer（可被省略/伪造某些情况）。
- 把 token 放 URL（会进日志/Referer 泄露）。
- 认为 HTTPS 能防 CSRF（不能，身份仍自动带）。

## 七、与开源书 / 权威来源对应
- OWASP《OWASP Top 10》与 CSRF 防护指南。
- Stuttard & Pinto《The Web Application Hacker's Handbook》CSRF 章。

## 八、面试题
- CSRF 利用什么机制？
- 常见防御手段？
- 为什么 SameSite Cookie 能缓解 CSRF？

## 九、演进与趋势
浏览器默认 SameSite=Lax；SameSite=None;Secure 用于跨站合法场景；token 仍作为强补充。

## 十、小结
CSRF 借自动凭证发非预期请求，靠 CSRF Token、SameSite Cookie 与 Origin 校验纵深防御，XSS 存在时防护被绕过。
