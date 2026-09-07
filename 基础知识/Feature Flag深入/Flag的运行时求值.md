# Flag的运行时求值

> 对应 Fowler 2002/2003 (Patterns of Enterprise Application Architecture)。

## 一、背景与挑战
Flag 判定若每次都远程查询会拖慢请求，且不同请求维度（用户、租户、设备）需要不同的命中逻辑。

## 二、核心原理
运行时求值基于上下文（ctx）做确定性哈希与规则匹配，结果本地缓存并按 TTL 刷新；保证同一上下文结果稳定。

## 三、形式化与数学基础
命中判定 hit = (hash(ctx.id) mod 100) < percent。要求同一 id 在有效期内 hash 稳定，从而体验一致；percent 由配置中心下发。

## 四、代码实现
```python
import hashlib
def hit(flag, ctx, percent):
    h = int(hashlib.md5(ctx["uid"].encode()).hexdigest(), 16)
    return (h % 100) < percent          # 稳定且可复现
```

## 五、与其他技术对比
相比随机判定，哈希保证用户一致性；相比仅按白名单，百分比支持平滑放量。

## 六、常见误区
- 用随机数判定导致同一用户反复横跳。
- 缓存未设 TTL，配置变更长时间不生效。

## 七、与开源书/权威来源对应
Fowler PoEAA 讨论基于上下文的策略解析。

## 八、面试题
为什么 Flag 判定要用哈希而非随机？如何保证缓存与配置一致？

## 九、演进与趋势
边缘节点就近求值，把 Flag 判定下沉到网关层，减少应用开销。

## 十、小结
运行时求值的稳定性来自确定性哈希与合理缓存，是 Flag 体验一致的技术基础。
