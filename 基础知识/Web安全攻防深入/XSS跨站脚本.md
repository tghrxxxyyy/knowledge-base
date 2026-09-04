# XSS跨站脚本

> 对应跨站脚本（Cross-Site Scripting）攻击与防御。

## 一、背景与挑战
XSS 指攻击者将恶意脚本注入到他人浏览的页面中执行，可窃取 cookie、伪造操作、钓鱼。分为存储型、反射型、DOM 型。

## 二、核心原理
- 存储型：恶意脚本存于数据库，受害者访问页面即执行。
- 反射型：脚本在 URL 参数中，服务端原样回显到页面。
- DOM 型：客户端 JS 把不可信数据写入 DOM（如 innerHTML）。
- 根因：把用户输入当代码/HTML 渲染，未编码或隔离。

## 三、形式化 / 数学基础
- 信任边界：用户输入 $u$ 属于不可信域，输出到 HTML 上下文需转义函数 $E_{ctx}(u)$。
- 上下文相关转义：HTML body、属性、JS 字符串、URL 各自不同 $E$。
- CSP 头 `default-src 'self'` 限制脚本来源，降低 XSS 影响。
- 同源策略下，恶意脚本以受害者源执行可读 `document.cookie`。

## 四、代码实现
```html
<!-- 错误：直接拼接用户内容 -->
<div innerHTML="<%= userInput %>"></div>
<!-- 正确：框架自动转义 + 显式转义 -->
<div>{{ userInput }}</div>            <!-- Vue/React 自动转义 -->
<!-- 防护：内容安全策略 -->
<meta http-equiv="Content-Security-Policy" content="script-src 'self'">
```

## 五、与其他技术对比
- XSS vs CSRF：XSS 执行脚本；CSRF 借用户身份发请求（见 CSRF）。
- 存储型 vs 反射型：前者持久、危害更广。
- 转义 vs CSP：转义治本，CSP 降损（纵深防御）。

## 六、常见误区
- 仅转义尖括号忽略属性/JS 上下文转义。
- 用 `innerHTML` 渲染用户输入。
- 以为 HttpOnly 防 XSS（只防 cookie 被读，不防脚本执行）。

## 七、与开源书 / 权威来源对应
- OWASP《OWASP Top 10》A03 Injection（含 XSS）。
- Stuttard & Pinto《The Web Application Hacker's Handbook》XSS 章。
- CS-Notes：https://github.com/CyC2018/CS-Notes （Web 安全 XSS）。

## 八、面试题
- 存储型、反射型、DOM 型 XSS 区别？
- 如何防御 XSS？CSP 作用？
- HttpOnly 能防 XSS 吗？

## 九、演进与趋势
Trusted Types 防 DOM XSS；框架默认转义；CSP 3 精细化。

## 十、小结
XSS 源于未隔离的用户输入被当作代码执行，靠上下文转义、框架自动转义与 CSP 纵深防御。
