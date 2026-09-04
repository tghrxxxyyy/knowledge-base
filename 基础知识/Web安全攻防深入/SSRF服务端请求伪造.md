# SSRF服务端请求伪造

> 对应服务端请求伪造（Server-Side Request Forgery）与内网防护。

## 一、背景与挑战
SSRF 让服务端代攻击者发起请求，可访问内网资源（元数据 169.254.169.254、内部 admin）、端口探测、甚至打到云控制面。

## 二、核心原理
- 成因：服务端根据用户输入构造 URL 并发请求（图片抓取、Webhook）。
- 利用：访问内网 IP、file:// 读文件、gopher 打内部协议、DNS rebinding 绕过校验。
- 防御：严格 URL 白名单（协议+主机）、解析后校验 IP 非内网、禁用非常规协议。
- 云场景：限制实例元数据访问（IMDSv2 需 token）。

## 三、形式化 / 数学基础
- 允许集 $A = \{(scheme, host) \mid scheme\in\{http,https\},\ host\in allowlist\}$。
- 校验流程：解析 URL → 解析 DNS → 校验 $ip \notin PrivateRanges$ → 再请求（防 rebinding 须在连接时复用一个解析结果）。
- 私有网段：$10.0.0.0/8,\ 172.16.0.0/12,\ 192.168.0.0/16,\ 169.254.0.0/16$。
- DNS rebinding：短时间返回公网 IP 通过校验、再返回内网 IP 实际连接 → 需 pin IP。

## 四、代码实现
```python
import ipaddress, socket
from urllib.parse import urlparse
def safe_fetch(url):
    p = urlparse(url)
    if p.scheme not in ("http","https"): raise ValueError
    ip = socket.gethostbyname(p.hostname)          # 解析一次并固定
    if ipaddress.ip_address(ip).is_private:
        raise ValueError("blocked private ip")
    return requests.get(url, timeout=3)            # 复用同一 ip
```

## 五、与其他技术对比
- SSRF vs CSRF：SSRF 打服务端/内网；CSRF 打用户身份。
- 白名单 vs 黑名单：白名单更稳（内网地址花样多）。
- 应用层校验 vs 网络隔离：两者结合（egress 防火墙）。

## 六、常见误区
- 仅校验域名不校验解析后的 IP（DNS rebinding）。
- 允许 file:// 等非常规协议。
- 忽略 IPv6/十进制 IP 绕过（如 `http://2130706433` = 127.0.0.1）。

## 七、与开源书 / 权威来源对应
- OWASP《OWASP Top 10》与 SSRF 防护备忘。
- Stuttard & Pinto《The Web Application Hacker's Handbook》SSRF 章。

## 八、面试题
- SSRF 能造成什么危害？
- 如何防御 SSRF？
- 什么是 DNS rebinding？如何防？

## 九、演进与趋势
云厂商默认 IMDSv2；egress 网络策略；URL 校验库标准化。

## 十、小结
SSRF 让服务端成为跳板，防御须白名单协议/主机、解析后校验非内网 IP 并防 DNS rebinding。
