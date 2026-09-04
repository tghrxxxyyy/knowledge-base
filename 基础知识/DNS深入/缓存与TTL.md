# 缓存与TTL

> 对应 RFC 1034 / RFC 1035；RFC 2308（Negative Caching）。

## 一、背景与挑战
每次都走完整递归解析代价高、延迟大、且给根/TLD 带来负载。缓存让解析器与客户端复用结果，但必须保证不过期不一致。

## 二、核心原理
每条 RR 带 TTL（秒）。解析器缓存记录在 TTL 内有效；过期则重新查询。TTL 由权威服务器设定，反映记录变更频率。negative caching（RFC 2308）缓存 NXDOMAIN 等否定响应以减负。

## 三、形式化 / 数学基础
缓存有效期：$expire\_time = cache\_time + TTL$。
客户端缓存（OPTIONAL，仅当响应含 TTL 且允许）：Coarse 实现常忽略。
SOA 中的 MINIMUM 字段在 RFC 2308 后作为否定缓存 TTL。

## 四、代码实现
```bash
# dig 查看 TTL（ttl=字段即剩余/原始 TTL）
dig +noall +answer www.example.com A
# 输出: www.example.com.  86400  IN  A  93.184.216.34
# 86400 秒 = 24h TTL
```

## 五、与其他技术对比
DNS 缓存是“时间驱动”的软状态；CDN 的 anycast + 短 TTL 实现近源调度。对比 HTTP 缓存用 max-age/ETag，机制不同但思想类似。

## 六、常见误区
误区一：改 DNS 立即全球生效。错，受 TTL 约束，最长可达数小时。误区二：缓存时间越久越好。错，过长致变更延迟。误区三：TTL 为 0 表示不缓存。对，但很多解析器仍有最小缓存。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 1034、RFC 1035、RFC 2308、Kurose & Ross 第 2 章。

## 八、面试题
1. 改了 A 记录为何部分地区还旧 IP？答：TTL 未过期。2. 负缓存作用？

## 九、演进与趋势
EDNS0 Client Subnet（ECS）让权威按客户端子网返回不同答案，配合短 TTL 做精细调度。

## 十、小结
TTL 驱动的 DNS 缓存平衡了性能与一致性，是 DNS 可扩展的关键。
