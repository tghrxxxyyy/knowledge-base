# Flag与配置中心的集成

> 对应 Fowler 2002/2003 (Patterns of Enterprise Application Architecture)。

## 一、背景与挑战
把 Flag 写死在代码或本地文件里，无法运行时动态调整，失去了开关最关键的"秒级开关"价值。

## 二、核心原理
Flag 的值存于配置中心，应用通过 SDK 订阅变更；运行时无需重启即可生效，并支持按用户、环境维度下发。

## 三、形式化与数学基础
求值函数 eval(flag, ctx) = lookup(configStore, flag, ctx)。订阅机制保证本地缓存最终一致：configStore 变更 -> 推送 -> 本地更新。

## 四、代码实现
```java
// 订阅式读取，配置变更自动刷新
FlagClient client = FlagClient.withSource(RedisConfigSource.of("redis://cfg"));
boolean on = client.getBoolean("promo-banner", false);
// 后台长连接接收变更，无需重启
```

## 五、与其他技术对比
相比进程内常量，配置中心支持动态与分群；相比数据库轮询，推送模式延迟更低。

## 六、常见误区
- 配置中心不可用时应用无法启动，应提供本地默认值兜底。
- 把高频读放大为远程调用，应本地缓存 + 订阅。

## 七、与开源书/权威来源对应
Fowler PoEAA 强调配置外置与集中管理。

## 八、面试题
配置中心宕机时 Flag 如何兜底？为什么需要本地缓存？

## 九、演进与趋势
Flag 服务独立成平台，提供审计、审批与影响面分析。

## 十、小结
Flag 与配置中心结合才能实现动态可控，兜底设计决定其韧性。
