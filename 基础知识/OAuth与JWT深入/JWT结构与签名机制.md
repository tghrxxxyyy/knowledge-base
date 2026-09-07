# JWT结构与签名机制

> 对应 RFC 7519 (JSON Web Token) / xiaolincoder/hello-http (GitHub)。

## 一、背景与挑战
JWT 作为无状态令牌在各方间安全传递声明，但一旦签名被错误验证(如 alg=none 或密钥弱)即被伪造，需理解其结构与验证。

## 二、核心原理
JWT = `header.payload.signature` 三段 Base64URL。header 含 alg(如 HS256/RS256)；payload 含标准声明(sub/exp/iat/aud)；signature 对前两段用密钥/私钥签名。RS256 用非对称，资源服务器仅持公钥验签。

## 三、形式化与数学基础
签名：
$$ sig = Sign_{key}(Base64URL(header)+"."+Base64URL(payload)) $$
验证：
$$ Verify(pubkey, sig, data) == true $$
过期校验：
$$ iat \le now \le exp $$

## 四、代码实现
```python
# 签发与验证 JWT(示意, 需 PyJWT)
import jwt, time
tok = jwt.encode({"sub":"u1","exp":int(time.time())+3600},
                 key=PRIV_KEY, algorithm="RS256")
# 资源服务器用公钥验
claims = jwt.decode(tok, PUB_KEY, algorithms=["RS256"], audience="api1")
```

## 五、与其他技术对比
JWT 无状态、自包含；服务端会话需查库。HS256 共享密钥难分布，RS256 公钥验签更适合多资源服务器。

## 六、常见误区
用 none 算法(被绕过)。把未验签的 payload 当可信。弱 HS256 密钥被爆破。exp 不校验致重放。

## 七、与开源书/权威来源对应
RFC 7519；OWASP JWT 备忘；xiaolincoder/hello-http；CS-Notes。

## 八、面试题
JWT 三段？RS256 与 HS256 区别？alg=none 风险？

## 九、演进与趋势
DPoP(持有证明)绑定令牌与客户端密钥防重放；token 绑定。

## 十、小结
JWT 以签名保证声明完整与来源，RS256 适合分布式验签，但必须严格校验算法与过期。
