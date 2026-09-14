# DoH与DoT

> 对应 RFC 7858（DNS over TLS）；RFC 8484（DNS over HTTPS）；RFC 8310（使用建议）；RFC 9230（Oblivious DoH）；RFC 9250（DoQ）。

## 一、背景与挑战
传统 DNS 走 UDP/53 明文，任何在路径上的节点都能观察查询内容、篡改应答或注入伪造包（运营商劫持、透明代理、中间人投毒）。即使部署了 DNSSEC，也只能保证「内容没被改」，无法阻止「谁看到了你查什么」和「直接丢弃/伪造失败」。因此需要把 DNS 放进带加密与认证的传输通道。

DoT/DoH 要解决的问题是**传输机密性与完整性**，同时引入新的权衡：端口可识别性 vs 抗封锁能力、连接建立开销 vs 复用收益、集中式解析器带来的可用性与隐私再集中、以及企业网络策略如何在新通道下继续生效。此外还有「应用看到明文（解析器侧）」与「协议元数据（SNI/时序）仍可分析」这两类残留暴露需要权衡。

## 二、核心原理
**DoT** 在 TLS（TCP/853 或 UDP/853 的 DoQ 变体）之上直接发送 DNS 报文，报文格式与常规 DNS 完全一致，只是在 TCP 流中需要 2 字节**长度前缀**来界定消息边界，避免粘包歧义。端口专属使其易被识别，也便于网络策略放行。

**DoH** 把 DNS 查询封装为 HTTPS 请求：GET 用 `?dns=<base64url(wireformat)>`，POST 用请求体承载原始二进制报文，媒体类型为 `application/dns-message`，端口 443，复用 HTTP/2 或 HTTP/3 的多路复用与头部压缩。由于与普通 Web 流量混同，DoH 更难被针对性封锁，但也更难被企业策略区分与审计。两者都复用既有 TLS 信任模型：证书验证保证「连的是谁」，DNS 报文内的来源认证仍属 DNSSEC 的职责，两者互补。**Oblivious DoH（RFC 9230）** 进一步引入中继：客户端只与中继建立连接，中继按加密的目标转发给解析器，使没有任何单一节点同时掌握「客户端身份」与「查询内容」。

## 三、形式化与数学基础
DoH GET 的请求行与编码：
$$ \mathrm{GET}\ /\mathrm{dns{-}query}?dns=\mathrm{base64url}(\mathrm{Wire}) \quad \mathrm{HTTP}/2 $$
其中 base64url 需去掉填充字符 `=`，并要求请求头
$$ \texttt{Accept: application/dns-message} $$
响应头为 `Content-Type: application/dns-message`。DoT 的帧化可写成带长度前缀的 TLV：
$$ \mathrm{frame} = \mathrm{len}(16\ \mathrm{bits}) \ \|\ \mathrm{DNSMessage}(\mathrm{len}) $$
连接复用的摊销成本可粗略表示为
$$ C_{amort} = \frac{C_{tls} + \sum_i (C_{query} + RTT/2)}{n} $$
即当 $n \to \infty$ 时，TLS 握手的固定开销被摊薄，DoH 的额外延迟主要体现为首次连接成本。相对 UDP 53，平均每条查询延迟增加约
$$ \Delta \approx \frac{RTT_{tls}}{n} + L_{http} $$
这是「加密的确定性代价」。ODoH 的威胁模型更强：单个中继或单个解析器均无法同时得到 $(\mathrm{client},\ \mathrm{query})$ 对，安全性依赖于至少一方不串谋。

## 四、代码实现
以 HTTP 客户端发起一次 DoH 查询（示意）：
```python
import base64, requests

def doh_query(wire_bytes, endpoint="https://dns.example/dns-query"):
    q = base64.urlsafe_b64encode(wire_bytes).rstrip(b"=").decode()
    r = requests.get(endpoint, params={"dns": q},
                     headers={"Accept": "application/dns-message"},
                     timeout=3)
    r.raise_for_status()
    return r.content          # 直接是 DNS 线格式报文，可交给解析器解析
```

DoT 需要在 TLS 流上补长度前缀：
```python
import socket, ssl, struct

def dot_query(wire_bytes, host="dns.example", port=853):
    ctx = ssl.create_default_context()          # 依赖系统 CA 与 SNI 校验
    with socket.create_connection((host, port), timeout=3) as raw:
        with ctx.wrap_socket(raw, server_hostname=host) as tls:
            tls.sendall(struct.pack("!H", len(wire_bytes)) + wire_bytes)
            head = tls.recv(2)
            n = struct.unpack("!H", head)[0]
            buf = b""
            while len(buf) < n:
                buf += tls.recv(n - len(buf))
            return buf
```

命令行验证：
```bash
# curl 走 DoH（需解析器提供 /dns-query 端点）
curl -H 'accept: application/dns-message' --data-binary @query.bin \
     https://dns.example/dns-query -o answer.bin
# kdig 可直接指定 DoT
kdig +tls @dns.example www.example.com
```

## 五、与其他技术对比
| 维度 | 传统 UDP/53 | DoT | DoH | DoQ | DNSCrypt |
| --- | --- | --- | --- | --- | --- |
| 端口 | 53/udp | 853/tcp | 443/tcp | 853/udp | 443 或自定义 |
| 加密 | 无 | TLS | TLS（HTTP 封装） | QUIC（TLS 1.3） | 自研 |
| 可识别性 | 高 | 高（专属端口） | 低（混同 Web） | 中 | 中 |
| 多路复用 | 无 | 连接复用 | HTTP/2、HTTP/3 强 | 原生多路 | 无 |
| 队头阻塞 | 不适用 | TCP 层存在 | HTTP/2 层存在，H3 缓解 | 基本消除 | 存在 |
| 来源认证 | 无 | 无（需 DNSSEC） | 无（需 DNSSEC） | 无（需 DNSSEC） | 无 |
| 标准化 | RFC 1035 | RFC 7858 | RFC 8484 | RFC 9250 | 非标准 |

## 六、常见误区
1. **「DoH 加密就绝对安全」**——错。仍依赖所选解析器可信：解析器能看到完整查询；且 SNI、时序、流量形态仍可能被分析。
2. **「DoH/DoT 提供来源认证」**——错。那属于 DNSSEC 的职责；加密只保证「传输途中不被改不被看」。
3. **「DoH 一定慢很多」**——不必然。HTTP/2 多路复用与长连接可摊薄握手成本，实际差异取决于连接复用与 RTT。
4. **「DoH 能防投毒」**——不完整。它防的是到解析器这一段被篡改；解析器之后的递归路径仍需 DNSSEC 或可信上游。
5. **「换成 DoH 后企业策略依然生效」**——不一定。443 混同导致无法按端口/协议识别，企业需改用端点白名单或客户端内置策略。

## 七、与开源书·权威来源对应
- RFC 7858：DoT 的协议规范，含长度前缀与连接复用要求。
- RFC 8484：DoH 的 GET/POST 编码、媒体类型与缓存语义。
- RFC 8310：DoT/DoH 的部署与使用建议（证书、失败回退、端口）。
- RFC 9230：Oblivious DoH，中继与加密目标的隐私增强模型。
- RFC 9250：DoQ，把 DNS 放到 QUIC 之上，消除传输层队头阻塞。
- Kurose & Ross《Computer Networking: A Top-Down Approach》第 2 章：DNS 与传输层安全的整体视角。
- Stevens《TCP/IP Illustrated, Volume 1》关于 UDP/TCP 与端口语义的基础描述。

## 八、面试题
1. **DoH 与 DoT 的端口与封装差别？** 要点：DoT 走 853 直发 DNS 报文（加长度前缀）；DoH 走 443，用 `application/dns-message` 承载 GET/POST，混同 Web 流量。
2. **二者是否提供来源认证？** 要点：否。传输加密 ≠ 数据来源认证，需 DNSSEC 配合。
3. **为什么说 DoH 更难被封锁也更难被管控？** 要点：复用 443 与标准 TLS，与普通 HTTPS 难以区分；代价是策略无法按协议识别，只能靠端点或客户端配置。
4. **DoQ 相比 DoT 的优势？** 要点：QUIC 原生多路复用与 0-RTT，消除传输层队头阻塞，丢包时单流不受影响。
5. **ODoH 的隐私模型是什么？** 要点：中继与解析器分离，任一单点都无法同时获得客户端标识与查询内容；前提是二者不串谋。

## 九、演进与趋势
传输层从 TCP 走向 QUIC（DoQ）以消除队头阻塞并利用 0-RTT；隐私层从「加密到解析器」走向「解析器也不可知」的 ODoH 类方案。工程侧，主流浏览器与操作系统逐步默认启用加密 DNS，同时提供「按域名分流」与企业策略接口，以缓解内网名字（split-horizon）与合规审计的冲突。可观测性侧，由于明文可见性下降，运维需要新的手段（端点侧采集、解析器日志、eBPF 观测）来判断解析质量。上述默认行为与策略接口**以各家与标准的官方最新文档为准**。

## 十、小结
DoH/DoT 用 TLS 为 DNS 传输加上机密性与完整性，堵住监听、篡改与注入；DoT 端口专属、部署路径清晰，DoH 借 443 与 HTTP 复用获得更强抗封锁能力，DoQ 在 QUIC 之上进一步优化多路与延迟。它们都不替代 DNSSEC——前者保护「传输」，后者保护「数据来源」，二者叠加才是完整方案；而集中化解析器与协议元数据暴露，则是加密 DNS 普及后需要持续处理的新权衡。
