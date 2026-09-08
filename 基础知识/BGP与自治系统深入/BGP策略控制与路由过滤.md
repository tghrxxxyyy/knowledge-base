# BGP策略控制与路由过滤

> 对应 RFC 4271 与业界路由策略实践（prefix-list / route-map / community）。

## 一、背景与挑战
运营网络需精确控制通告与接收哪些前缀、对路径施加偏好。缺乏过滤可能导致路由泄漏、黑洞或跨国流量绕行，影响 SLA 与成本。

## 二、核心原理
策略通过前缀列表（prefix-list）匹配网段、route-map 施加动作（set local-pref、prepend、community、拒绝）、community 标记批量控制。入向过滤防收垃圾路由，出向过滤防泄漏内部明细。AS_PATH prepend 人为加长路径以降优先级。

## 三、形式化与数学基础
前缀列表匹配：
$$ \text{match}(p, len) \iff p \in prefix\_list \land len \in [min, max] $$
prepend 改变 AS_PATH 长度：
$$ AS\_PATH_{out} = AS\_PATH_{orig} \oplus (ASN,\dots,ASN) $$
使对端选路时该路径「更长」从而次优。

## 四、代码实现
前缀列表与 route-map 示例（FRR 风格）：
```text
ip prefix-list PL_OK seq 10 permit 203.0.113.0/24
route-map EXPORT permit 10
 match ip address prefix-list PL_OK
route-map EXPORT deny 20
neighbor 192.0.2.2 route-map EXPORT out
```
Community 标记：
```text
route-map SET_COMM permit 10
 set community 65001:100
```

## 五、与其他技术对比
ACL 侧重包过滤，前缀列表专为前缀设计更直观；route-map 比简单 deny 更灵活，可 match+set 组合。RPKI 提供密码学级起源验证补充人工策略。

## 六、常见误区
误区一是只在出向过滤就够了，入向同样需防接收非法/默认路由造成黑洞。误区二是 prepend 一定能抢到流量，对端也可能设置 LOCAL_PREF 覆盖。

## 七、与开源书/权威来源对应
RFC 4271 属性与策略框架；业界 NANOG 演讲强调出/入向过滤；CyC2018 笔记有 BGP 策略要点。

## 八、面试题
问：如何防止把内部明细路由泄漏到上游？答：出向用 prefix-list 仅放行聚合前缀、用 route-map 拒绝私有/内部网段，并配合 RPKI 验证。

## 九、演进与趋势
RPKI/RTR 自动来源验证减少劫持；BGP 流规（RFC 8956）可快速缓解攻击；ASPA 增强路径验证。

## 十、小结
BGP 策略以前缀列表、route-map 与 community 实现精细的收发控制，是网络安全与流量工程的主要手段，需出入向双向防护。
