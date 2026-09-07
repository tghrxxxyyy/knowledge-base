# tcpdump与抓包分析

> 对应 man tcpdump(8) 与 Wireshark 文档；参考 RFC 793（TCP 分析依据）。

## 一、背景与挑战
当应用层指标异常（重传、延迟尖刺），需抓包看真实报文。tcpdump 是命令行抓包利器。

## 二、核心原理
tcpdump 基于 libpcap，在链路层捕获帧，按 BPF 过滤表达式筛选，可保存 pcap 供 Wireshark 分析。关注 TCP 标志、SEQ/ACK、RTT、重传。

## 三、形式化与数学基础
过滤表达式：
  host 1.1.1.1 and port 443 and tcp[tcpflags] & tcp-syn != 0
RTT 推算：
  RTT = time(SYN-ACK) - time(SYN)
重传判定：
  if duplicate SEQ seen -> retransmission

## 四、代码实现
# 抓取与主机 10.0.0.2 的 TLS 流量前 100 包
tcpdump -i any -nn -c 100 -w cap.pcap host 10.0.0.2 and port 443
# 实时看握手
tcpdump -i any -nn 'tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn'
# 分析重传
tshark -r cap.pcap -Y "tcp.analysis.retransmission"

## 五、与其他技术对比
eBPF 聚合更轻量，tcpdump 适合全量取证；二者互补。

## 六、常见误区
1. 在繁忙接口抓全量导致性能与磁盘问题，应先过滤。
2. 误读 RTT 为应用延迟（含排队与处理）。

## 七、与开源书/权威来源对应
- man tcpdump(8)
- Wireshark 文档
- RFC 793

## 八、面试题
如何用 tcpdump 抓握手？如何识别重传？BPF 过滤是什么？

## 九、演进与趋势
kss/retina 等 eBPF 工具替代部分抓包场景。

## 十、小结
tcpdump 是网络排障的"显微镜"，结合 Wireshark 能定位绝大多数传输问题。
