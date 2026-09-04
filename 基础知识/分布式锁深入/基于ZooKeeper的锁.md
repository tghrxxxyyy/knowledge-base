# 基于 ZooKeeper 的锁

> 对应 Hunt 等《ZooKeeper: Wait-free coordination for Internet-scale systems》(USENIX 2010)。

## 一、背景与挑战
ZooKeeper 提供有序临时节点(ephemeral sequential znode)，天然适合实现公平、可靠、可撤销的分布式锁，且基于 Zab 共识保证强一致。

## 二、核心原理
加锁流程：
1. 在 /locks/resource/ 下创建临时顺序节点 /locks/resource/lock-<seq>。
2. 列出该目录下所有子节点，若自己是序号最小者则获锁。
3. 否则对前一个(序号次小)节点注册 Watcher，等待其删除事件。
4. 前驱释放(会话断开临时节点被删)后收到通知，重新检查自己是否最小。
释放：客户端断开或显式删除节点即释放；会话超时也会自动删临时节点，避免死锁。

## 三、形式化 / 数学基础
顺序保证：ZK 对每个子节点分配全局单调序号 seq，构成全序。
公平性：按 seq 升序排队，先到先得。
容错：临时节点绑定会话，崩溃即释放；Zab 保证锁状态在多数派存活时一致。

## 四、代码实现
```java
// 伪代码(zkClient)
String path = zk.create("/locks/r/lock-", EPHEMERAL_SEQUENTIAL);
List<String> children = zk.getChildren("/locks/r");
if (isSmallest(path, children)) { /* 获锁 */ }
else {
    String prev = prevInOrder(path, children);
    zk.exists(prev, watch=true); // 等前驱删除
}
```

## 五、与其他技术对比
- 相比 Redis 锁：基于共识更强一致、公平、可避免误释放，但延迟更高。
- 相比 etcd：思想类似(etcd 用 lease + 前缀键 + 监听)。

## 六、常见误区
- 误区：用持久节点做锁。崩溃不释放会死锁；必须用 ephemeral。
- 误区：轮询检查最小节点。应注册 Watcher 避免惊群(herd effect)。

## 七、与开源书 / 权威来源对应
- Hunt et al.《ZooKeeper》(USENIX 2010)。
- Kleppmann《DDIA》第 8 章。
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. 为什么 ZooKeeper 锁用临时顺序节点？
2. 如何避免羊群效应？
3. 会话超时对锁有何影响？

## 九、演进与趋势
etcd 的 concurrency 库、Curator 的 InterProcessMutex 封装了上述模式，成为事实标准。

## 十、小结
ZooKeeper 锁借助临时顺序节点与 Watcher 实现了公平、容错、强一致的分布式互斥，是经典可靠方案。
