# NAT穿透与STUNTURNICE

> 对应 RFC 5389 (STUN) / RFC 5766 (TURN) / RFC 8445 (ICE)。

## 一、背景与挑战
NAT 隐藏内网地址，使两个位于不同 NAT 后的主机难以直接建立 P2P 连接。穿透需发现自身公网映射并建立可达路径，但对称型 NAT 使简单打洞失效，需要中继兜底。

## 二、核心原理
STUN 让客户端通过与公网服务器交换 Binding 请求/响应，发现自己的公网 IP:端口与 NAT 类型。ICE 综合多条候选地址（host、srflx 反射、relay 中继），通过连通性检查按优先级选出可用路径。TURN 作为中继，当打洞失败后由服务器转发流量，保证可达但增加带宽成本。

## 三、形式化与数学基础
ICE 候选地址集合：
$$ C = C_{host} \cup C_{srflx} \cup C_{relay} $$
连通性检查对每对 $(c_i, c_j)$ 互发 STUN 探测，选出首个成功且优先级最高的配对：
$$ p^* = \arg\max_{(i,j)} (P(c_i) + P(c_j)) $$
其中 $P$ 为候选优先级（relay 最低，host/srflx 较高）。

## 四、代码实现
Python 使用 asyncio_dgram 或 pystun 探测：
```python
import stun
nat_type, external_ip, external_port = stun.get_ip_info()
print(nat_type, external_ip, external_port)
```
ICE 通常由 libnice / WebRTC 栈实现，应用层配置 STUN/TURN URI：
```text
stun:stun.l.google.com:19302
turn:turn.example.com?transport=udp
```

## 五、与其他技术对比
纯中继（TURN/ SFU）最稳但贵；纯打洞省带宽但受 NAT 类型限制；ICE 折中，先打洞失败再中继。UPnP 映射是另一种避免对称 NAT 的思路。

## 六、常见误区
误区一是以为有 STUN 就一定能打洞，对称 NAT 下反射地址每次不同，打洞常失败需 TURN。误区二是把 STUN 服务器当中继，STUN 仅回显地址不转发数据。

## 七、与开源书/权威来源对应
RFC 5389 定义 STUN；RFC 5766 定义 TURN；RFC 8445 定义 ICE 候选与检查；WebRTC 规范采用 ICE/STUN/TURN。

## 八、面试题
问：ICE 为什么需要 TURN？答：当两端处于对称 NAT 等无法打洞成功时，TURN 中继保证连通性，代价是服务器转发流量。

## 九、演进与趋势
WebRTC 将 ICE/STUN/TURN 标准化进浏览器，QUIC 与 P2P over UDP 进一步推动打洞实践；IPv6 端到端可达后打洞需求下降。

## 十、小结
NAT 穿透以 STUN 发现映射、ICE 协商路径、TURN 兜底中继，是实时音视频与 P2P 的基石。理解 NAT 类型与候选优先级是设计穿透方案的关键。
