# PKCE扩展原理

> 对应 RFC 7636 (Proof Key for Code Exchange) / RFC 6749。

## 一、背景与挑战
公共客户端(移动/SPA)无法安全存 client_secret，遭截获的授权码可被兑换令牌。PKCE 用临时密钥挑战抵御授权码拦截。

## 二、核心原理
客户端先生成高熵 `code_verifier`，计算 `code_challenge = BASE64URL(SHA256(verifier))` 并在授权请求带挑战。换 token 时提交原始 verifier，服务器校验哈希匹配，确保换 token 者即发起者。

## 三、形式化与数学基础
挑战构造：
$$ challenge = \text{Base64Url}(SHA256(verifier)) $$
校验：
$$ SHA256(submitted\_verifier) == challenge $$
攻击者截获 code 但无 verifier 无法换 token。

## 四、代码实现
```python
import hashlib, base64, secrets
verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=")
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier).digest()).rstrip(b"=")
# 授权请求带 code_challenge；换 token 带原 verifier
```

## 五、与其他技术对比
PKCE 替代 client_secret 于公共客户端；与 state 防 CSRF 互补(不同目标)。机密客户端也可叠加使用。

## 六、常见误区
以为 PKCE 只用于移动端——现为所有客户端推荐。用 plain 方法(无哈希)形同虚设。

## 七、与开源书/权威来源对应
RFC 7636；OAuth 2.0 Security BCP(RFC 9700)；xiaolincoder/hello-http。

## 八、面试题
PKCE 解决什么？verifier 与 challenge 关系？为何公共客户端需要？

## 九、演进与趋势
OAuth 2.1 将 PKCE 设为授权码强制要求，弃 implicit。

## 十、小结
PKCE 以动态 challenge/verifier 绑定授权码与客户端，消除公共客户端截码风险。
