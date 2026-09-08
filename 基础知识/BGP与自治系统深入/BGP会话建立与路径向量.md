# BGP会话建立与路径向量

> 对应 RFC 4271 (BGP-4) 与 RFC 1657 (MIB) 背景。

## 一、背景与挑战
BGP 运行于 TCP 179，需在邻居间建立可靠会话并增量交换可达性。其路径向量算法既要防止域间环路，又要支持丰富的策略控制，复杂度远高于 IGP。

## 二、核心原理
对等体先经 TCP 三次握手，再交换 OPEN（含 ASN、hold time、能力）协商，进入 Established 后周期性发 KEEPALIVE 并保持，路由变化以 UPDATE 增量通告/撤销。路径向量在 AS_PATH 中记录经过的 AS，避免环路并用于选路。

## 三、形式化与数学基础
UPDATE 消息含：
$$ (NLRI, PathAttributes, WithdrawnRoutes) $$
其中 $PathAttributes$ 含 ORIGIN、AS_PATH、NEXT_HOP、MED、LOCAL_PREF、Community 等。会话状态机：
$$ Idle \to Connect \to Active \to OpenSent \to OpenConfirm \to Established $$

## 四、代码实现
FRR/Bird 查看会话状态：
```bash
vtysh -c 'show ip bgp neighbors' | grep -i state
birdc show protocols all peer1
```
开启会话与能力：
```text
neighbor 192.0.2.2 remote-as 65002
neighbor 192.0.2.2 timers 30 90
```

## 五、与其他技术对比
IGP 用拓扑计算最短路径，BGP 用路径向量做可达性与策略，不依赖全网拓扑。OSPF 收敛快但跨域不可扩展，BGP 慢但策略强。

## 六、常见误区
误区一是认为 BGP 选最短「跳数」，实际 AS_PATH 长度仅是多属性决策中的一个。误区二是 KEEPALIVE 丢失立刻断，受 hold timer 控制。

## 七、与开源书/权威来源对应
RFC 4271 规定状态机与消息；RFC 1930 背景；Kurose & Ross 第4章描述 BGP 会话与路径向量。

## 八、面试题
问：BGP 为什么跑在 TCP 上？答：借助 TCP 可靠传输避免自实现重传/排序，且 179 端口建立会话，UPDATE 增量可靠送达。

## 九、演进与趋势
BGP 增加多协议扩展（MP-BGP，RFC 4760）支持 IPv6/VPN/标签；BFD 加速故障检测；Add-Path 允许发多条等价路径。

## 十、小结
BGP 以 TCP 上的会话、路径向量与丰富属性实现可扩展、可策略的域间路由，是互联网骨干的路由协议核心。
