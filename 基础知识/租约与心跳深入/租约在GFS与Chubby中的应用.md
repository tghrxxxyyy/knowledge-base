# 租约在GFS与Chubby中的应用

> 对应 Ghemawat et al. 2003（The Google File System，chunk lease）与 Burrows 2006（Chubby 论文）。

## 一、背景与挑战
GFS 中主 chunk 服务器需要协调多客户端的追加/写入顺序；Chubby 作为锁服务需要安全地选举 master。两者都依赖租约把协调权限时化，避免崩溃后永久阻塞。

## 二、核心原理
- GFS：master 给 primary chunk 发租约，期间它负责定序；租约到期前续租。
- Chubby：通过 Paxos 选出的 master 持租约对外服务，租约过期则重新选举。

## 三、形式化与数学基础
GFS 中租约时长 T 需大于典型写完成时间，且小于故障切换可容忍停顿。Chubby master 租约用于限制“脑裂窗口”，要求 $T_{lease} \gg T_{election}$。

## 四、代码实现
# GFS 风格 primary 租约
def grant_primary(chunk, server, now, T):
    if chunk.primary_expire > now:
        return False
    chunk.primary = server
    chunk.primary_expire = now + T
    return True

## 五、与其他技术对比
- 对比无租约定序：崩溃会导致定序权悬空。
- 对比 ZooKeeper 会话：ZK 用临时节点+会话超时近似租约。

## 六、常见误区
1. 租约过期后 primary 仍接受写造成不一致。
2. master 与 chunk 租约时长不匹配。

## 七、与开源书/权威来源对应
- Ghemawat et al. 2003, GFS §3.1。
- Burrows 2006, Chubby。
- Kleppmann, DDIA, Ch.8。

## 八、面试题
1. GFS 为什么给 primary chunk 发租约？
2. Chubby master 租约过期会怎样？

## 九、演进与趋势
把租约与 fencing token 绑定，防御陈旧 primary 写。

## 十、小结
租约把协调权明确限时，是 GFS/Chubby 高可用的关键设计。
