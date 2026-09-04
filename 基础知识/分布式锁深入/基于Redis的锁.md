# 基于 Redis 的锁

> 对应 Redis 官方 Redlock 算法(Antirez, 2016) 及 Kleppmann 的批评分析。

## 一、背景与挑战
Redis 因低延迟常被用来实现分布式锁(SET NX)。单机 Redis 有单点风险；Redlock 尝试用多个独立 Redis 节点提升可用性，但其正确性存在争议。

## 二、核心原理
单节点加锁：
```
SET lock_key token NX PX 30000
```
仅当 key 不存在(NX)才设置，带 30s 过期(PX)，value 用唯一 token 以便安全释放。
释放用 Lua 脚本保证“仅当 value 匹配才删除”(避免误删他人锁)：
```
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end
```
Redlock：向 N(通常 5) 个独立节点依次申请锁，超过半数(>=N/2+1)且总耗时 < TTL 才算成功。

## 三、形式化 / 数学基础
安全性依赖：
- 唯一 token 保证释放只针对自己持有的锁。
- 过期时间 TTL 防止死锁。
Redlock 争议(Kleppmann)：若节点时钟跳变或 GC 停顿，仍可能双持锁；其正确性依赖“有界时钟”假设，而真实系统不满足严格同步时钟。

## 四、代码实现
```python
import redis, uuid
r = redis.Redis()
token = str(uuid.uuid4())
ok = r.set("lock:order", token, nx=True, px=30000)
# 释放 (Lua 脚本作为单行字符串，避免三层引号)
script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
r.eval(script, 1, "lock:order", token)
```

## 五、与其他技术对比
- 优点：低延迟、简单。
- 缺点：Redis 异步复制下主宕机可能丢锁(非 Redlock)；Redlock 正确性受时钟假设限制。
- 相比 etcd/ZooKeeper 基于共识的锁，Redis 锁弱一致。

## 六、常见误区
- 误区：用 DEL 直接释放。会误删他人锁，必须用 token + Lua。
- 误区：Redlock 绝对安全。Kleppmann 指出在时钟异常下仍可能失效。

## 七、与开源书 / 权威来源对应
- Antirez《Distributed locks with Redis》(Redlock, 2016)。
- Kleppmann 对 Redlock 的批判文章(2016)。
- DDIA 中文: https://github.com/Vonng/ddia

## 八、面试题
1. 为什么释放锁必须用 Lua 脚本校验 token？
2. Redlock 的争议点是什么？
3. Redis 异步复制下锁可能如何丢失？

## 九、演进与趋势
对正确性要求高的场景转向 etcd/Consul(Zab/Raft) 的共识锁；Redis 锁用于“尽力而为”的互斥。

## 十、小结
基于 Redis 的锁实现简单、延迟低，但安全边界有限；Redlock 提升可用性却未彻底解决时钟假设问题。
