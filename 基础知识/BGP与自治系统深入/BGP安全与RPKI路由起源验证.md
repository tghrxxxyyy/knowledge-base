# BGP安全与RPKI路由起源验证

> 对应 RFC 6811 (ROA/RPKI) 与 RFC 6480 (RPKI) 系列。

## 一、背景与挑战
BGP 本身信任收到的路由，历史上多次发生路由前缀劫持（如误通告他人前缀导致流量被导向）。RPKI 以密码学手段验证「哪个 AS 有权起源某前缀」，缓解起源劫持。

## 二、核心原理
资源持有者（通过 RIR）签发 ROA（Route Origin Authorization）证书，声明某前缀可由某 ASN 起源。验证器（如 RTR 协议从缓存取数据）对 BGP 路由做 Route Origin Validation ROV：若路由的 (prefix, origin AS) 与 ROA 不符则标记 invalid，运营可配置为丢弃或降优先级。

## 三、形式化与数学基础
ROA 声明：
$$ ROA = \{ (prefix, maxLength, originAS) \} $$
验证判定：
$$ valid \iff \exists roa \in ROA: prefix \subseteq roa.prefix \land |prefix| \le roa.maxLength \land originAS == roa.originAS $$
$$ invalid \text{ 若冲突；notFound 若无匹配 ROA} $$

## 四、代码实现
启用 RPKI（FRR 风格）：
```text
rpki
  rdki cache 192.0.2.100 323 port 8282
  rdki polling-period 300
router bgp 65001
  bgp rpki validation enable
  bgp rpki enforce origin invalid drop
```
查看验证结果：
```bash
vtysh -c 'show bgp rpki status'
```

## 五、与其他技术对比
ROV 只验证起源 AS，不验证完整 AS_PATH（需 ASPA/RFC 9234 增强）。相比手工过滤，RPKI 由权威签发更可扩展；但依赖生态覆盖度。

## 六、常见误区
误区一是 RPKI 能防所有劫持，实际仅防起源错误，路径篡改仍可能。误区二是 invalid 一定不通，取决于运营是否 enforce drop。

## 七、与开源书/权威来源对应
RFC 6480 定义 RPKI 体系；RFC 6811 定义 ROA 与 ROV；RFC 9234 定义 ASPA；NANOG 多次强调 ROV 部署。

## 八、面试题
问：RPKI 能防止什么、不能防止什么？答：能验证前缀起源 AS 合法性（防起源劫持），不能验证完整路径是否被篡改（需 ASPA/路径验证）。

## 九、演进与趋势
ROV 部署率逐年上升；ASPA 与 BGP 流规（Flowspec）增强；RTR 协议（RFC 6810）让路由器实时拉取验证数据。

## 十、小结
RPKI/ROV 以密码学签名的 ROA 验证 BGP 起源，是缓解前缀劫持的关键基础设施，需配合 enforce 策略才能真正生效。
