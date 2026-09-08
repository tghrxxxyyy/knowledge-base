# VXLAN与MACinUDP

> 对应 RFC 7348 (VXLAN) 与数据中心 overlay 实践。

## 一、背景与挑战
传统 VLAN 只有 12 位（4096）隔离标识，难以满足云多租户规模；且二层域受物理拓扑限制。VXLAN 以 MAC-in-UDP 在三层 IP 之上构建大二层 overlay，扩展标识空间并跨越 IP 网络。

## 二、核心原理
VXLAN 将原始以太帧封装进 UDP（目的端口 4789），外加 VXLAN 头含 24 位 VNI（约 1600 万租户）。VTEP 负责封装/解封装，借助底层 IP 路由将二层帧在跨子网的主机间传输，实现逻辑大二层。

## 三、形式化与数学基础
VXLAN 头关键字段：
$$ (Flags, Reserved, VNI[24bit], Reserved) $$
标识空间：
$$ N_{VNI} = 2^{24} \gg 2^{12}\ (\text{VLAN}) $$
封装总长：
$$ L = L_{eth} + L_{IP} + L_{UDP}(8) + L_{VXLAN}(8) + L_{inner} $$
外层目的 IP 为远端 VTEP，由 VNI 与 MAC 查表（常借助组播或 EVPN）确定。

## 四、代码实现
Linux 创建 VXLAN 接口：
```bash
ip link add vxlan0 type vxlan id 100 \
  dev eth0 dstport 4789 group 239.1.1.1 ttl 255
ip link set vxlan0 up
bridge fdb append 00:00:00:00:00:00 dev vxlan0 dst 192.0.2.20
```
查看：
```bash
bridge fdb show dev vxlan0
```

## 五、与其他技术对比
VLAN 受 4K 限制且为物理二层；VXLAN 用 IP 承载、规模大且跨三层。NVGRE 用 GRE 而非 UDP；Geneve 更灵活可扩展。

## 六、常见误区
误区一是 VXLAN 自带加密，它仅 overlay 不保密。误区二是 VXLAN 取代路由，实际仍依赖底层 IP 路由与 VTEP 学习。

## 七、与开源书/权威来源对应
RFC 7348 定义 VXLAN 封装与 VNI；Linux bridge/VXLAN 文档；云网络（如 Neutron）广泛采用。

## 八、面试题
问：VXLAN 为什么用 UDP 而非 IP 协议号？答：UDP 端口可被普通网络设备基于 ECMP 负载分担，且易穿越 NAT 与现有 IP 网络。

## 九、演进与趋势
EVPN 用 BGP 分发 VXLAN 控制平面取代组播泛洪；硬件 VTEP offload 提升性能；Geneve 作为更通用后继。

## 十、小结
VXLAN 以 MAC-in-UDP 在 IP 上构建大二层 overlay，24 位 VNI 突破 VLAN 规模限制，是数据中心多租户网络的主流方案。
