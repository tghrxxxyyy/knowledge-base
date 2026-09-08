# PIM稀疏模式与Rendezvous点

> 对应 RFC 4601 (PIM-SM) 与 RFC 7761 (PIM 更新)。

## 一、背景与挑战
组播路由协议需在网络中建立从源到接收者的分发树。密集模式（PIM-DM）适合接收者密集场景但易泛洪；稀疏模式（PIM-SM）假设接收者稀疏，借助汇聚点 RP 按需建树，更适合大规模网络。

## 二、核心原理
PIM-SM 中接收者先通过 IGMP 加入，DR 向 RP 发送 (*, G) Join 建立共享树 RPT；源向 RP 注册 (S,G)，RP 沿共享树下发。数据可在 RPT 上传输，也可由接收者侧触发 (S,G) Join 切换到源树 SPT 以获得更优路径。RP 可静态配置或用 BSR/Auto-RP 动态发现。

## 三、形式化与数学基础
共享树状态：
$$ RPT: (*, G) \text{ 以 RP 为根} $$
源注册后源树：
$$ SPT: (S, G) \text{ 以源 } S \text{ 为根} $$
切换阈值（SPT 切换）由 `spt-threshold` 控制，按速率触发：
$$ \text{switch to SPT if } rate > threshold $$

## 四、代码实现
FRR/Quagga 配置 PIM-SM：
```text
router pim
 ip pim rp-address 192.0.2.1
 interface eth0
  ip pim sm
```
查看邻居与状态：
```bash
vtysh -c 'show ip pim neighbor'
vtysh -c 'show ip mroute'
```

## 五、与其他技术对比
PIM-DM 以泛洪-剪枝适合密集，PIM-SM 以 RP 按需适合稀疏；PIM-SSM 进一步简化去掉 RP，仅用 (S,G) 源树。

## 六、常见误区
误区一是 RP 是性能瓶颈，实际数据在 SPT 切换后不经 RP。误区二是 SPT 一定更优，某些场景 RPT 已足够且避免切换开销。

## 七、与开源书/权威来源对应
RFC 4601 定义 PIM-SM 与 RP 机制；RFC 7761 整合更新；Kurose & Ross 第4章简述组播路由。

## 八、面试题
问：PIM-SM 为什么要先走 RPT 再切 SPT？答：RPT 无需源信息即可让接收者快速收到流，随后按阈值切到源树获得更短路径、减轻 RP 负担。

## 九、演进与趋势
PIM-SSM 在视频等指定源场景成为主流；BIER 探索比特索引转发免建树；SDN 用控制器集中算树。

## 十、小结
PIM-SM 以 RP 汇聚、按需建立共享树并可选切源树，是大规模稀疏组播的标准方案，理解 RP 与 SPT 切换是运维核心。
