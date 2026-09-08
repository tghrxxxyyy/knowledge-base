# Geneve与新一代Overlay

> 对应 RFC 8926 (Geneve) 与 overlay 演进实践。

## 一、背景与挑战
VXLAN/NVGRE 头部固定，难以携带元数据与适配新协议，控制器与数据面耦合受限。Geneve 以可变长、可扩展的隧道头满足云网络对灵活元数据与多协议的需求。

## 二、核心原理
Geneve 同样以 UDP 承载（默认端口 6081），但头部含可变长选项（TLV），可携带租户、安全、调度等元数据。封装协议类型字段标识内层载荷（以太、IPv4/IPv6 等）。其设计目标是由控制平面自由定义选项，数据平面仅透传，解耦演进。

## 三、形式化与数学基础
Geneve 头：
$$ (Ver, OptLen, O, C, R, R, R, R, Protocol, VNI[24bit], Reserved, [options\ TLV...]) $$
选项区长度由 OptLen 指定（每 4 字节为单位）：
$$ L_{opt} = OptLen \times 4 $$
外层长度：
$$ L = L_{IP} + 8 + 8 + L_{opt} + L_{inner} $$

## 四、代码实现
Geneve 由支持的数据平面（如 OVS、智能网卡）实现；OVS 配置示例：
```bash
ovs-vsctl add-port br0 geneve0 -- \
  set interface geneve0 type=geneve options:remote_ip=192.0.2.30 options:key=100
```
查看：
```bash
ovs-vsctl show
```

## 五、与其他技术对比
VXLAN 头固定 8 字节无选项；Geneve 可变长选项更灵活；NVGRE 用 GRE 无 UDP 不便 ECMP。Geneve 更适合多控制器、异构数据面。

## 六、常见误区
误区一是 Geneve 比 VXLAN 更快，灵活以头部变长为代价，性能取决于 offload。误区二是 Geneve 自带安全，仍需上层加密。

## 七、与开源书/权威来源对应
RFC 8926 定义 Geneve 头与选项；OVS/云网络采用；相比 RFC 7348 VXLAN 更现代。

## 八、面试题
问：Geneve 相比 VXLAN 主要优势？答：可变长 TLV 选项可携带丰富元数据且由控制平面定义，数据平面透明转发，便于演进与多场景复用。

## 九、演进与趋势
智能网卡 offload Geneve 选项解析；与 EVPN 控制平面结合；作为 VXLAN 的灵活继任者在云原生网络推广。

## 十、小结
Geneve 以可变长选项与 UDP 承载提供可扩展 overlay，解耦控制与数据平面，是面向云网络灵活性的新一代隧道封装。
