# DDoS分类

> 对应 DDoS 分类实践；RFC 4732（互联网 DoS 考量）。

## 一、背景与挑战
分布式拒绝服务（DDoS）利用大量僵尸主机向目标倾泻流量或请求，耗尽带宽、连接、计算资源，使服务不可用。分类有助于针对性防护。

## 二、核心原理
按层次：L3/L4  volumetric（洪泛，耗尽带宽，如 UDP/ICMP/NTP 放大）、协议型（耗尽连接表，如 SYN 洪泛）、应用层（耗尽 CPU/DB，如 HTTP GET 洪泛、Slowloris）。按动机：竞技、勒索、政治。按来源：直接、反射放大、僵尸网络。

## 三、形式化 / 数学基础
目标容量模型：当 $\lambda_{attack} \gg C_{link}$ 或 $\lambda_{attack} \gg R_{service}$ 时服务不可用。
攻击强度：$I = \sum_{i} rate_i$（总bps/pps）。防御目标：使有效 $\lambda_{to\_target} < C$。

## 四、代码实现
```bash
# 识别异常 pps/bps（伪监控）
iptables -L -v -n | awk '$1>100000 {print "高流量规则:", $0}'
# 应用层：统计单 IP 单位时间请求数
```

## 五、与其他技术对比
Volumetric 靠带宽清洗；协议型靠连接表限速/ SYN Cookie；应用层靠七层限流/WAF。三者防护手段不同，常需多层联动。

## 六、常见误区
误区一：DDoS 都是大流量。错，应用层小流量也能打垮。误区二：加带宽就够。错，单点带宽有限、成本高。误区三：防火墙能挡所有 DDoS。错，需运营商级清洗。

## 七、与开源书 / 权威来源对应
- CS-Notes：https://github.com/CyC2018/CS-Notes
- RFC 4732、Kurose & Ross 第 1 章（安全概述）。

## 八、面试题
1. DDoS 分哪几类？2. 应用层 DDoS 特点？

## 九、演进与趋势
IoT 僵尸网络（Mirai）使攻击规模空前；AI 助长自适应低速攻击；零信任与边缘清洗结合。

## 十、小结
DDoS 按层分为容量型、协议型、应用层，分类决定防护策略，需多层联动。
