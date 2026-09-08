# 组播分发树与RPF检查

> 对应 RFC 4601 (PIM) 与组播转发基础（RPF）。

## 一、背景与挑战
组播转发与单播相反：单播按目的找路，组播按来源逆向建树并避免环路。错误转发会导致组播风暴，反向路径转发 RPF 是防环与正确建树的关键机制。

## 二、核心原理
RPF 检查：当路由器从某接口收到 (S,G) 报文时，确认该入接口正是单播路由表中到达源 S 的最佳出接口（即 RPF 接口），否则丢弃。这样保证组播流只沿「朝向源」的方向进入网络，自然形成无环分发树。

## 三、形式化与数学基础
RPF 判定：
$$ \text{accept}(pkt,\ in\_if) \iff in\_if == RPF\_interface(S) $$
其中 $RPF\_interface(S)$ 由单播路由表（含静态 mrroute）查得。出接口列表 OIL 由加入状态决定：
$$ OIL(G) = \{ \text{ports with }( *,G) \text{ or }(S,G) \text{ state} \} $$

## 四、代码实现
Linux 查看组播路由与 RPF：
```bash
ip mroute show
# 使用 smcroute 或 pimd 维护
```
概念性 RPF：
```python
def rpf_check(src, in_if, unicast_fib):
    return in_if == unicast_fib.rpf_interface(src)
```

## 五、与其他技术对比
单播转发依据目的 FIB，组播 RPF 依据源 RPF 接口，方向性相反。RPF 失败通常源于非对称路由或缺少到源的路由。

## 六、常见误区
误区一是组播靠目的地址路由，实际靠源 RPF。误区二是 RPF 失败一定配置错，也可能是非对称路径需静态 mrroute。

## 七、与开源书/权威来源对应
RFC 4601 规定 RPF 用于 PIM 建树；组播基础教材（Tanenbaum）描述 RPF 防环；CyC2018 笔记提及。

## 八、面试题
问：RPF 检查失败会怎样？答：报文被丢弃，接收者收不到组播，常见原因是到源的回程路径与入接口不一致。

## 九、演进与趋势
MBGP（RFC 4760）为组播维护独立 RPF 拓扑；BIER 以无状态位图转发弱化传统树与 RPF 依赖。

## 十、小结
RPF 以「按源反向」检查入接口，是组播无环转发与建树的基础，理解它才能排查组播不通与环路问题。
