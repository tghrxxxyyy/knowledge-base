# SQL注入

> 对应 SQL 注入（SQL Injection）攻击与参数化查询防御。

## 一、背景与挑战
SQL 注入是头号注入类风险。攻击者通过构造输入改变 SQL 语义，可读库、改库甚至拿到服务器权限。根因是拼接 SQL 字符串。

## 二、核心原理
- 拼接漏洞：`"SELECT * FROM u WHERE name='"+input+"'"` 输入 `' OR '1'='1` 改变逻辑。
- 利用：UNION 读其他表、盲注（基于真假/时间）、报错注入。
- 防御：参数化查询（prepared statement），数据与指令分离。
- 纵深：最小权限 DB 账号、输入校验、ORM、WAF。

## 三、形式化 / 数学基础
- 安全目标：输入 $x$ 只作为数据值而非语法 token，即查询语言 $L$ 中 $x \notin L_{syntax}$。
- 参数化：占位符 `?` 由驱动转义/绑定，保证 $x$ 不参与解析。
- 盲注布尔：$P(payload\ true) \neq P(payload\ false)$ 推断信息。
- 最小权限：DB 用户权限集 $P_{app} \subset P_{admin}$ 限制注入影响。

## 四、代码实现
```python
# 错误：字符串拼接
cur.execute("SELECT * FROM users WHERE name='" + name + "'")
# 正确：参数化
cur.execute("SELECT * FROM users WHERE name=%s", (name,))
# ORM 同样安全
User.query.filter_by(name=name).first()
```

## 五、与其他技术对比
- 参数化 vs 转义：参数化治本；手动转义易遗漏/依赖上下文。
- ORM vs 原生 SQL：ORM 默认参数化，但原生 SQL 误用仍危险。
- 输入黑名单 vs 白名单：白名单（如枚举类型）更可靠。

## 六、常见误区
- 仅过滤单引号（宽字节/编码绕过）。
- 用 `eval`/格式化拼 SQL。
- 认为存储过程天然防注入（内部拼接仍可被注入）。

## 七、与开源书 / 权威来源对应
- OWASP《OWASP Top 10》A03 Injection（SQLi）。
- Stuttard & Pinto《The Web Application Hacker's Handbook》SQL 注入章。
- CS-Notes：https://github.com/CyC2018/CS-Notes （Web 安全 SQL 注入）。

## 八、面试题
- SQL 注入根因？如何防御？
- 参数化查询为什么有效？
- 盲注如何工作？

## 九、演进与趋势
默认 ORM/参数化框架普及；WAF+语义分析；最小权限与只读副本。

## 十、小结
SQL 注入源于拼接，参化查询实现数据与指令分离，配合最小权限与输入白名单形成纵深防御。
