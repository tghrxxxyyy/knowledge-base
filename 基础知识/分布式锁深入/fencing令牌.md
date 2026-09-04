# fencing 令牌

> 对应 Kleppmann《DDIA》第 8 章“Fencing tokens”及 Chubby 的序列号思路。

## 一、背景与挑战
即便有锁，持锁者可能因 GC 停顿/网络延迟在锁过期后仍在写数据，造成与“新持锁者”并发写冲突。fencing token 提供一种让资源端拒绝“过期持锁者”写请求的机制。

## 二、核心原理
- 锁服务在每次授权(或每次租约)时返回单调递增的整数 fencing token。
- 资源/存储侧记录“已接受的最大 token”，对携带 token <= 已见最大值的写请求直接拒绝。
- 旧持锁者(拿到较小 token)即使延迟到达，其写也会被拒绝，从而保证安全。
本质：把“互斥”从“阻止并发”转为“顺序裁决”，不依赖客户端时钟。

## 三、形式化 / 数学基础
设锁服务返回 token t，单调递增：t_a < t_b 若 a 授权早于 b。
资源维护 seen_token = max 已接受 token。写请求带 token t'：
accept iff t' > seen_token; then seen_token = t'.
由此任意两个写 w1(t1), w2(t2) 按 token 全序生效，并发旧持锁者被拒。

## 四、代码实现
```python
class FencedResource:
    def __init__(self): self.seen = 0
    def write(self, token, data):
        if token <= self.seen:
            raise Exception("stale lock holder")
        self.data = data
        self.seen = token
        return True
```

## 五、与其他技术对比
- 相比“仅靠 TTL 锁”：fencing 不依赖客户端是否及时释放，防御更强。
- 类比：ZooKeeper 的 czxid/事务序号、etcd 的 mod_revision 可作 fencing 依据。

## 六、常见误区
- 误区：有锁就无需 fencing。锁过期后的陈旧写仍会破坏数据。
- 误区：token 可用客户端时间。必须用锁服务的单调计数器。

## 七、与开源书 / 权威来源对应
- Kleppmann《DDIA》第 8 章。
- Burrows《The Chubby lock service》(OSDI 2006) 的 sequence number 思想。
- DDIA 中文: https://github.com/Vonng/ddia

## 八、面试题
1. fencing token 解决了锁的什么问题？
2. 为什么 token 必须单调递增且由锁服务颁发？
3. 资源端如何用它拒绝陈旧写？

## 九、演进与趋势
fencing 与“带版本的存储”(如条件写 where version)结合，成为云存储并发控制标配。

## 十、小结
fencing token 用单调递增序号让资源端裁决写顺序，从根本上防御了“过期持锁者”的陈旧写，是分布式锁安全性的关键补强。
