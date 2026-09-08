# 自治系统AS与ASN分配

> 对应 RFC 1930 (AS) 与 RFC 4271 (BGP)。

## 一、背景与挑战
互联网由众多独立管理的网络组成，需在统一框架下互联。自治系统 AS 把「单一技术管理域」抽象为一个路由实体，分配全球唯一的 ASN，使域间路由可扩展、可策略化。

## 二、核心原理
AS 是在同一管理策略下、使用统一路由协议的一组分网络。ASN 由区域互联网注册机构 RIR 分配，16 位（0–65535）已紧张，RFC 4893/6793 扩展为 32 位（4 字节）。AS 间用 eBGP 交换可达性，AS 内用 IGP（OSPF/IS-IS）与 iBGP。

## 三、形式化与数学基础
AS 路径在 BGP 更新中以序列表示：
$$ AS\_PATH = (AS_1, AS_2, \dots, AS_n) $$
环路检测：若本 AS 号已出现在 $AS\_PATH$ 中则拒收：
$$ \text{accept} \iff ASN_{self} \notin AS\_PATH $$
ASN 取值范围扩展后：
$$ ASN \in [0, 2^{32}-1] $$

## 四、代码实现
Linux/FRR 查看 ASN 与 BGP 会话：
```bash
vtysh -c 'show ip bgp summary'
ip bgp ?   # 或用 birdc 查看
```
Bird 配置片段：
```text
router id 10.0.0.1;
protocol bgp peer {
  local as 65001;
  neighbor 192.0.2.2 as 65002;
  import all; export all;
}
```

## 五、与其他技术对比
AS 是管理边界概念，IGP 是 AS 内部路由；BGP 是 EGP 事实标准，区别于 OSPF 等 IGP 的距离/链路状态算法，强调策略与路径向量。

## 六、常见误区
误区一是认为 ASN 决定地理位置，ASN 仅标识管理域。误区二是私有 ASN（64512–65534 及 4 字节私有段）不能全球通告。

## 七、与开源书/权威来源对应
RFC 1930 定义 AS 概念与 ASN；RFC 4271 定义 BGP-4；Kurose & Ross 第4章介绍 AS 与 BGP 角色。

## 八、面试题
问：AS_PATH 有什么作用？答：既是环路检测依据（出现自身即丢弃），也是路由优选与策略（如 AS 路径长度、prepend）的关键属性。

## 九、演进与趋势
32 位 ASN 缓解耗尽；BGP 扩展到 VPN/流量工程（RFC 4364、RFC 8956）；RPKI 为 ASN 起源提供认证。

## 十、小结
AS 与 ASN 将互联网划分为可管理、可策略路由的域，BGP 以 AS_PATH 描述跨域路径并防环，是互联网可扩展互联的基石。
