# 认证授权（JWT / OAuth2）

> 用户登录后，系统怎么知道「你是谁、能干什么」？本文讲清 **认证（Authentication）与授权（Authorization）的区别**、**Session vs JWT**、**OAuth2 四种授权模式**，以及生产怎么落地。
> 标准参考：JWT（[RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)）、OAuth 2.0（[RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)）；开源实现：[spring-projects/spring-security](https://github.com/spring-projects/spring-security)（Java 安全框架）、[keycloak/keycloak](https://github.com/keycloak/keycloak)（Identity and Access Management）。

---

## 一、认证 vs 授权（一字之差）

| 概念 | 英文 | 回答 | 例子 |
|------|------|------|------|
| **认证** | Authentication | 你是谁？ | 登录、验证码、指纹 |
| **授权** | Authorization | 你能做什么？ | 角色权限、能否删数据 |

> 先认证（确认身份），再授权（判定权限）。Spring Security 里 `Authentication`（是谁）和 `Authorization`（能访问啥）是两回事。

---

## 二、Session-Cookie 方案（传统）

```mermaid
sequenceDiagram
    participant U as 用户
    participant S as 服务端
    U->>S: 登录(账号密码)
    S->>S: 校验通过, 生成Session, 存Redis/内存
    S-->>U: Set-Cookie: JSESSIONID=xxx
    U->>S: 后续请求带 Cookie
    S->>S: 查 Session 识别用户
```

- ✅ 服务端可控、可随时踢人（删 Session）、安全。
- ❌ 服务端要存 Session（分布式要集中存 Redis）、跨域麻烦、移动端不友好。

---

## 三、JWT 方案（无状态）

### 3.1 结构（三段 base64）

`header.payload.signature`

- **Header**：算法（HS256/RS256）、类型。
- **Payload**：Claims（sub、exp、role、自定义）。
- **Signature**：用密钥对前两段签名，防篡改。

```json
// payload 示例
{"sub":"1001","name":"xuyu","role":"ADMIN","exp":1761897600}
```

### 3.2 流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as 认证服务
    U->>A: 登录(账号密码)
    A-->>U: 返回 JWT(签名令牌)
    U->>A: 后续请求带 Authorization: Bearer xxx
    A->>A: 验签名+过期+权限, 直接放行
```

- ✅ **无状态**：服务端不存会话，JWT 自带身份信息，适合分布式 / 移动端 / 跨域。
- ❌ **无法主动失效**：令牌到期前一直有效，除非加黑名单（又变有状态）。
- ❌ 载荷可被 base64 解码（**别放敏感信息**），只靠签名防篡改不防泄露。

### 3.3 关键实践

- **短过期 + 刷新令牌（Refresh Token）**：access_token 短（如 15min），refresh_token 长（如 7d）存服务端可吊销；access 过期用 refresh 换新的。
- **签名算法选 RS256（非对称）**：公钥验签、私钥签名，公钥可公开分发（网关验签无需私钥）。
- **HTTPS 必选**：Bearer Token 明文传输，必须 TLS。
- **黑名单 / 吊销**：退出登录 / 封号时，把 jti 放进 Redis 黑名单至过期。
- **防重放**：加 `jti` + `nonce` + 时间戳。

---

## 四、OAuth2（授权框架，不是认证）

OAuth2 解决「**第三方应用如何获得用户授权去访问资源**」，典型：用微信登录某 App。

### 4.1 四种授权模式

| 模式 | 适用 | 说明 |
|------|------|------|
| **授权码（Authorization Code）** | 有后端的 Web 应用（最常用、最安全） | 先拿 code 再换 token，token 不暴露给浏览器 |
| **授权码 + PKCE** | 公共客户端（SPA / 移动端） | 无 client_secret，用 code_verifier 防拦截 |
| **隐式（Implicit）** | 老式 SPA（**已不推荐**） | 直接返回 token，易泄露 |
| **密码（Password）** | 高度信任的第一方应用 | 用户把账号密码给客户端（不推荐第三方） |
| **客户端凭证（Client Credentials）** | 服务到服务（机器对机器） | 无用户，用 client 凭证拿 token |

### 4.2 授权码模式流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant C as 第三方App
    participant AS as 授权服务器
    U->>C: 点击"微信登录"
    C->>AS: 重定向, 带client_id/redirect_uri/scope
    AS-->>U: 登录并授权
    AS->>C: 回调 code
    C->>AS: code + client_secret 换 token
    AS-->>C: access_token
    C->>AS: 带 token 调资源接口
```

> **OpenID Connect（OIDC）** = OAuth2 + 身份认证层（在 token 外多给 `id_token`），解决「认证」问题。用微信 / Google 登录实际是 OIDC。

---

## 五、Spring Security 落地

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain chain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(a -> a
                .requestMatchers("/public/**").permitAll()
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults())) // 验 JWT
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .build();
    }
}
```

- **资源服务器（Resource Server）**：只验 JWT（RS256 公钥），不登录。
- **授权服务器（Authorization Server）**：发 token，可用 Spring Authorization Server 或 Keycloak。
- **方法级授权**：`@PreAuthorize("hasRole('ADMIN')")`。

---

## 六、Keycloak（企业级 IAM）

- 开源身份与访问管理，开箱即用的授权服务器（OIDC / OAuth2 / SAML）。
- 提供用户管理、SSO、社交登录、LDAP 集成、细粒度授权。
- 适合不想自己造授权服务器的团队：部署 Keycloak，应用只做资源服务器验 token。

---

## 七、常见坑

1. **JWT 放敏感信息**：payload 仅 base64，任何人可解码 → 只放非敏感 claims。
2. **token 永久有效**：不设 exp 或过长 → 泄露即永久沦陷，必须短过期 + 刷新。
3. **用 HS256 但密钥弱**：HS256 对称，密钥泄露全完蛋 → 高安全用 RS256。
4. **退出登录没吊销**：JWT 无状态，退出只是前端删 token，后端仍认 → 加黑名单或短过期。
5. **OAuth2 用 Implicit / 密码模式**：已不推荐，用授权码 + PKCE。
6. **HTTP 传 token**：必须 HTTPS，否则被抓包。
7. **权限写死**：用 RBAC（角色）或 ABAC（属性），别在代码里硬判断。

---

## 八、面试高频速查

- **认证 vs 授权？** 认证确认身份（你是谁），授权判定权限（能做什么）。
- **JWT 三段？** header（算法）+ payload（claims）+ signature（签名防篡改）。
- **JWT 优缺点？** 无状态易扩展；缺点是无法主动失效、载荷可解码不能放敏感信息。
- **怎么解决 JWT 无法注销？** 短过期 + refresh token；或 jti 黑名单（Redis）。
- **OAuth2 最安全模式？** 授权码（PKCE for 公共客户端）。
- **OAuth2 vs OIDC？** OAuth2 是授权框架；OIDC 在其上做认证（加 id_token）。
- **Session vs JWT？** Session 服务端可控可踢人但需存储；JWT 无状态易扩展但难吊销。

---

## 九、与其他板块的关系

- 和「**基础知识/API 网关**」：网关常做统一 JWT 校验（`JwtAuthFilter`）。
- 和「**基础知识/注册中心与配置中心**」：Keycloak / 授权服务器可注册到 Nacos。
- 和「**架构/系统架构**」：认证授权是「安全层」，属横切关注点。
- 和「**基础知识/中间件**」其他篇：各中间件自身的鉴权（如 MinIO 预签名、Kong JWT 插件）都基于此原理。
