# BGP路由反射器与Confederation

> 对应 RFC 4456 (Route Reflection) 与 RFC 3060 (Confederation) 背景。

## 一、背景与挑战
iBGP 要求全网全互联（Full Mesh）以保证环路自由，但 AS 内路由器增多时 $O(n^2)$ 会话数不可扩展。路由反射器 RR 与联盟 Confederation 是两种打破全互联、降低复杂度的方案。

## 二、核心原理
路由反射器将部分路由器设为 RR，客户端只与 RR 建立 iBGP；RR 反射路由时添加 ORIGINATOR_ID 与 CLUSTER_LIST 防环。Confederation 把一个 AS 划分为多个子 AS（成员 AS），子 AS 间用 eBGP 类会话、子 AS 内仍 iBGP，对外隐藏内部结构，依靠 AS_CONFED 序列防环。

## 三、形式化与数学基础
RR 防环属性：
$$ \text{若 } ORIGINATOR\_ID == \text{本 router-id} \Rightarrow \text{丢弃} $$
$$ \text{若 } router\text{-}id \in CLUSTER\_LIST \Rightarrow \text{丢弃} $$
Confederation 路径：
$$ AS\_CONFED\_SEQUENCE \text{ 不泄漏到真实 eBGP 之外} $$
会话数从 $O(n^2)$ 降至约 $O(n)$（RR 方案）。

## 四、代码实现
Bird 配置 RR：
```text
protocol bgp rr_client {
  local as 65001;
  neighbor 10.0.0.2 as 65001;
  rr client;          # 声明为反射客户端
  import all; export all;
}
```

## 五、与其他技术对比
RR 部署简单、集中控制，存在单点需冗余；Confederation 更分布式但配置复杂、跨子 AS 策略难。二者都避免 Full Mesh 爆炸。

## 六、常见误区
误区一是认为 RR 改变 AS_PATH，反射不改 AS_PATH 仅加 RR 属性。误区二是 Confederation 子 AS 会暴露给全网，实际对外部仍是一个 AS。

## 七、与开源书/权威来源对应
RFC 4456 定义 RR 及防环属性；RFC 5065 更新 Confederation；Kurose & Ross 提及 iBGP 扩展问题。

## 八、面试题
问：RR 如何防环？答：用 ORIGINATOR_ID（起源路由器 id）与 CLUSTER_LIST（反射簇 id 列表）避免路由被反射回起源或环内循环。

## 九、演进与趋势
大规模云网络多用 RR 层级（多级反射）；Add-Path 与 RR 结合可传递多路径；自动化工具生成 RR 拓扑。

## 十、小结
路由反射器与 Confederation 都解决 iBGP 全互联扩展性问题，RR 以反射属性防环、更易部署，是大型 AS 的主流选择。
