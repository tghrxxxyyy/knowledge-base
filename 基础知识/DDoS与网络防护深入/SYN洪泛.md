# SYN洪泛

> 对应 RFC 4987（SYN 洪泛防护）；RFC 6528（SYN Cookie）。

## 一、背景与挑战
TCP 三次握手服务端在收到 SYN 后分配半连接（SYN_RECV），攻击者伪造大量源 IP 发 SYN 却不完成握手，耗尽半连接表，使合法连接无法建立。

## 二、核心原理
防护手段：SYN Cookie（不在服务端存半连接，而是把连接信息编码进 SYN+ACK 的序列号，ACK 回来时校验还原，无状态）；SYN 代理/网关代为完成握手再转发；限速与黑名单；增大半连接表与超时。

## 三、形式化 / 数学基础
半连接表容量 $T$，攻击速率 $R_{syn}$，超 $T$ 后合法 SYN 被丢弃。
SYN Cookie：服务器计算 $seq = f(srcIP, dstIP, srcPort, dstPort, t)$（含秘密与时间），不存状态；收到 ACK 且 $ack-1 == seq$（且含正确编码）即通过，重建 socket。

## 四、代码实现
```bash
# Linux 开启 SYN Cookie
sysctl -w net.ipv4.tcp_syncookies=1
# 限制 SYN 速率（伪）
iptables -A INPUT -p tcp --syn -m limit --limit 100/s -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP
```

## 五、与其他技术对比
SYN Cookie（无状态、抗表耗尽）vs SYN 代理（有状态、需资源）；前者可能影响部分 TCP 选项（早期实现），现代实现已较完善。对比应用层防御不触及握手。

## 六、常见误区
误区一：SYN 洪泛只耗带宽。错，主要耗尽半连接表/CPU。误区二：关半连接表就安全。错，仍耗 CPU 与带宽。误区三：SYN Cookie 会丢数据。错，正常连接不受影响。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 4987、RFC 6528、Kurose & Ross 第 3 章。

## 八、面试题
1. SYN 洪泛原理？2. SYN Cookie 如何无状态防御？

## 九、演进与趋势
SYN Flood 仍是头号 L4 DDoS；结合机器学习识别异常 SYN 模式、硬件卸载防护。

## 十、小结
SYN 洪泛耗尽半连接表，SYN Cookie 以无状态编码对抗，是 TCP 握手层经典防护。
