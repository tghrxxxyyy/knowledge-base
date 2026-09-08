# NAPT端口映射与端口分配

> 对应 RFC 3022 (NAT) 与 RFC 4787 (NAT Behavioral Requirements)。

## 一、背景与挑战
NAPT 必须为每个内部会话分配唯一的外部端口，端口分配策略直接影响映射稳定与穿透成功率。不同实现（Linux MASQUERADE、家用路由器、CGNAT）行为各异，造成 P2P 与 VoIP 场景的不一致。

## 二、核心原理
出站首包触发分配：NAT 从其端口池选一个未占用端口作为外部端口，建立映射并改写源地址端口，同时重写 TCP/UDP 校验和。入站报文依据目的端口查表还原。分配策略含端口范围、是否复用、以及映射有效期（空闲超时被回收）。

## 三、形式化与数学基础
设端口池大小为 $P$，已用映射数 $U$，则新会话可分配端口概率：
$$ \Pr(\text{成功}) = \frac{P - U}{P} $$
映射寿命 $L$ 由 `nf_conntrack_udp_timeout` 等参数控制，UDP 默认较短、TCP 关联连接状态。

## 四、代码实现
Linux MASQUERADE 端口范围由 `net.netfilter.nf_conntrack_*_timeout` 与 NAT 范围控制：
```bash
sysctl -w net.netfilter.nf_conntrack_udp_timeout=60
iptables -t nat -A POSTROUTING -j MASQUERADE --to-ports 1024-65535
```
查看映射：
```bash
conntrack -L 2>/dev/null | head
```

## 五、与其他技术对比
静态端口映射（端口转发）将固定外部端口恒定映射到内网，适合服务器；NAPT 动态分配适合客户端出站。UPnP/NAT-PMP 让内网主机主动请求固定映射。

## 六、常见误区
误区一是以为外部端口等于内部端口，NAT 通常重新分配以避免冲突。误区二是认为映射永久有效，实际空闲超时后释放。

## 七、与开源书/权威来源对应
RFC 4787 规定 NAT 映射行为（如端口分配独立性、保活要求）；RFC 3022 描述端口重写与校验和；xiaolincoder 图解 NAT 端口转换。

## 八、面试题
问：为什么 UDP 映射超时比 TCP 短？答：UDP 无连接状态，NAT 无法感知关闭，只能靠超时为映射计时回收，默认较短以防表项耗尽。

## 九、演进与趋势
RFC 6888 要求 CGNAT 记录端口分配日志以满足溯源合规，端口分配进一步受日志容量约束；IPv6 逐步减少大规模 NAPT 需求。

## 十、小结
NAPT 端口分配是会话复用的关键，分配策略、端口池与超时共同决定并发能力与穿透行为，需结合 RFC 4787 行为要求理解。
