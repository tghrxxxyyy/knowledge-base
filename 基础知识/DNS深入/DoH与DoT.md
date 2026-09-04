# DoH与DoT

> 对应 RFC 8484（DNS over HTTPS）；RFC 7858（DNS over TLS）。

## 一、背景与挑战
传统 DNS 用 UDP/53 明文传输，易被监听、篡改、注入（如运营商劫持、中间人投毒）。DoH/DoT 给 DNS 查询加加密与认证通道。

## 二、核心原理
DoT：DNS 消息直接在 TLS 连接上传输（TCP/853），保持 DNS 报文格式。DoH：把 DNS 查询封装为 HTTPS POST/GET（RFC 8484，application/dns-message），走 443 端口，与 Web 流量难以区分，抗审查更强。

## 三、形式化 / 数学基础
DoH 请求（GET）：$GET /dns-query?dns=<base64url(WireFormat)>\ HTTP/2$，要求 `Accept: application/dns-message`。
DoH 请求（POST）：body 为二进制 DNS 报文。
DoT：在 TLS 之上直接发 DNS 报文，前有 2 字节长度前缀（避免 TCP 粘包）。

## 四、代码实现
```python
import requests, base64
q = base64.urlsafe_b64encode(dns_wire_request).rstrip(b"=")
r = requests.get(f"https://dns.google/dns-query?dns={q.decode()}",
                 headers={"Accept": "application/dns-message"})
```

## 五、与其他技术对比
DoT 端口专属易识别、部署简单；DoH 复用 443 更难被封锁但更难被网络策略管控。对比 DNSCrypt（非正式标准，已少用于公共解析）。

## 六、常见误区
误区一：DoH 加密就绝对安全。错，仍依赖可信解析器，且解析器可见明文。误区二：DoH/DoT 提供起源认证。错，那是 DNSSEC 职责，二者互补。误区三：DoH 慢很多。错，HTTP/2 多路复用可抵消开销。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 8484、RFC 7858、Kurose & Ross 第 2 章。

## 八、面试题
1. DoH 与 DoT 端口区别？答：DoH 443、DoT 853。2. 二者都要配合什么才防投毒？答：DNSSEC。

## 九、演进与趋势
主流浏览器/系统默认 DoH； Oblivious DoH（RFC 9230）进一步隐藏查询内容于解析器。

## 十、小结
DoH/DoT 用 TLS 加密 DNS 传输防监听篡改，DoH 走 443 抗封锁更强，二者与 DNSSEC 互补。
