# 头部压缩HPACK

> 对应 RFC 7541（HPACK）；RFC 9113。

## 一、背景与挑战
HTTP 头部（如 User-Agent、Cookie）大量重复且冗长，HTTP/1.1 每个请求都重传完整头部，在高频小请求场景下开销巨大。HPACK 专为 HTTP/2 设计头部压缩。

## 二、核心原理
HPACK 结合：(1) 静态表（RFC 预定义 61 项常见头部）；(2) 动态表（连接内随请求增删的上下文）；(3) Huffman 编码。索引寻址使重复头部只需发一个整数索引，新值用字面量 + Huffman。

## 三、形式化 / 数学基础
表示法：索引头部用 1 位 + 7 位索引（或长度前缀整数）；字面量头部用首字节标志位区分“增量/不改动态表”。
Huffman 码长表来自 RFC 7541 附录（按字节出现频率）。
动态表大小上限：$SETTINGS\_HEADER\_TABLE\_SIZE$，满则逐出最旧项（类 LRU）。

## 四、代码实现
```python
# 伪：编码已知头部 :method: GET（静态表索引 2）
def encode_static(idx):
    return bytes([0x80 | idx])  # 最高位置 1 表示索引表示
# 例：0x82 == 索引 2 == :method: GET
```

## 五、与其他技术对比
HPACK 是有状态、防 CRIME 攻击的（不压缩跨连接上下文）；SPDY 的 zlib 压缩有 CRIME 漏洞。HPACK 通过“动态表 + 禁止跨流共享”规避。

## 六、常见误区
误区一：HPACK 就是 gzip 压头部。错，gzip 有 CRIME 风险，HPACK 专用且安全。误区二：动态表跨连接共享。错，仅单连接内有效。误区三：所有头部都可索引。错，敏感头部可禁止入表。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 7541（HPACK）、RFC 9113、Kurose & Ross 第 2 章。

## 八、面试题
1. HPACK 由哪三部分组成？2. 为什么不用 gzip 压头部？

## 九、演进与趋势
QPACK（RFC 9204）为 HTTP/3/QUIC 设计，解决动态表与乱序到达的协调问题。

## 十、小结
HPACK 用静态表 + 动态表 + Huffman 实现安全高效头部压缩，是 HTTP/2 省带宽的核心。
