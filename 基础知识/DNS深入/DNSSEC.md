# DNSSEC

> 对应 RFC 4033 / RFC 4034 / RFC 4035（DNSSEC）；RFC 5155（NSEC3）。

## 一、背景与挑战
DNS 原始设计无源认证，易遭缓存投毒、中间人篡改（如把银行域名解析到钓鱼 IP）。DNSSEC 提供数据起源认证与完整性，但不加密。

## 二、核心原理
DNSSEC 用非对称签名：权威区用 ZSK（Zone Signing Key）对 RRSet 签名生成 RRSIG；用 KSK（Key Signing Key）对 DNSKEY 集签名。解析器沿 DS（Delegation Signer）记录从父区到子区验证链，直至信任锚（根已预置）。

## 三、形式化 / 数学基础
签名：$RRSIG = Sign_{ZSK_{priv}}(RRSet\ +\ 覆盖类型\ +\ 有效期)$。
验证：$Verify_{ZSK_{pub}}(RRSet,\ RRSIG) == true$，且 $ZSK$ 经 $KSK$ 签名、$KSK$ 经父区 $DS$ 哈希链校验。
否定存在：NSEC/NSEC3 用“区间证明”表明某名不存在，防伪造 NXDOMAIN。

## 四、代码实现
```text
example.com.  IN DNSKEY 257 3 8 <KSK公钥>   ; Secure Entry Point
example.com.  IN DNSKEY 256 3 8 <ZSK公钥>
www.example.com. IN A 93.184.216.34
www.example.com. IN RRSIG A 8 2 86400 ... <ZSK签名>
com.   IN DS <hash of example.com KSK>      ; 父区信任链
```

## 五、与其他技术对比
DNSSEC 只认证不加密（仍明文传输），与 DoH/DoT（加密传输）互补；对比 Web PKI 用 CA，DNSSEC 是层级签名链。DNSCurve 曾提议加密但未被广泛采纳。

## 六、常见误区
误区一：DNSSEC 加密 DNS。错，仅签名认证。误区二：部署 DNSSEC 就防所有攻击。错，不防 DoS、不隐藏查询。误区三：NSEC 泄露全部域名。对，故引入 NSEC3 哈希化名。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 4033、RFC 4034、RFC 4035、RFC 5155、Kurose & Ross 第 2 章。

## 八、面试题
1. DNSSEC 能加密吗？2. ZSK 与 KSK 区别？

## 九、演进与趋势
与 DoH/DoT 结合形成“认证 + 加密”双重防护；根区已完整签名。

## 十、小结
DNSSEC 用层级签名链为 DNS 记录提供起源认证与完整性，是抵御投毒的基石但不加密。
