# 头部压缩HPACK

> 对应 RFC 7541（HPACK）；RFC 9113（HTTP/2）。

## 一、背景与挑战
HTTP/1.1 每个请求都携带近乎完整且高度重复的头部（User-Agent、Accept、Cookie 等）。在高频小请求、尤其是移动弱网场景下，头部字节往往超过实际 body，造成严重的带宽与 RTT 浪费。更棘手的是，头部中存在可猜测的常量（如 `:method: GET`）与敏感但可枚举的字段（如 Cookie 值）。

若采用通用压缩器（如 zlib）压缩整段头部，攻击者可通过控制部分明文、观测压缩后长度来推断其余明文——这正是 CRIME（Compression Ratio Info-leak Made Easy）攻击的根因：压缩率本身就是一条长度侧信道。HTTP/2 因此专门设计了有状态、上下文隔离的头部压缩方案 HPACK，目标是在减少冗余的同时从机制上消除跨字段长度泄露。这也解释了为何 HPACK 宁可牺牲部分压缩率也要换取隔离边界。

## 二、核心原理
HPACK 由三部分协同构成：静态表（Static Table）、动态表（Dynamic Table）、Huffman 编码。

1. **静态表**：RFC 7541 附录 A 预定义 61 项常见头部名/值，例如索引 2 为 `:method: GET`、索引 8 为 `:status: 200`。它不占连接内存，是两端天然共享的只读基准。
2. **动态表**：连接级、可增删的有状态表，位于静态表之后（索引从 62 起）。编码器每遇到新头部即可选择「增量索引」写入，后续同头部只需发索引。
3. **Huffman 编码**：对字面量字符串使用 RFC 7541 附录 B 的静态 Huffman 码表（按字节频率生成），对高频字节（空格、冒号、小写字母）给更短码长。

头部字段有五种表示形式，首字节前缀决定语义：索引表示（最高位 `1`，后跟 7 位索引）；带增量索引的字面量（前缀 `01`）；不带索引的字面量（`0000`）；永不索引的字面量（`0001`）；动态表大小更新（`001`）。其中「永不索引」用于 Cookie、Authorization 等敏感字段——它们仍可被 Huffman 压缩，但绝不进入动态表，从而避免后续请求通过「发一个短索引」来探测该敏感值是否被复用，这正是对 CRIME 的直接回应。

## 三、形式化与数学基础
整数编码采用 N 位前缀：令 $M=2^{N}-1$。若值 $v<M$，则直接填入前缀；否则前缀填全 $1$，再对 $v'=v-M$ 按 7 位一组、最高位作续传标志编码：

$$ encode(v):\quad v<M \Rightarrow prefix=v;\quad v\ge M \Rightarrow prefix=2^N-1,\; (v-M)\ \text{以 7-bit 续传字节发送} $$

动态表占用上限由 `SETTINGS_MAX_HEADER_TABLE_SIZE` 限定为 $S_{max}$。插入新项（大小 $s$，含名、值及 32 字节固定开销）后若累计 $U>S_{max}$，则自表头（最旧）逐出，直至 $U\le S_{max}$：这是一个类 LRU 的环形淘汰。Huffman 编码期望长度近似为 $L_{huff} \approx \sum_{b} p_b \cdot \ell_b$，其中 EOS 符号（码 256）用于在字节边界处填充，保证编码串长度为整数字节。HPACK 整数最大可表示到 $2^{64}-1$，前缀宽度 N 依字段不同为 4/5/6/7/8。

## 四、代码实现
```c
// 伪代码：HPACK 整数解码（N 位前缀，续传位为最高位）
int decode_int(const uint8_t *p, int N, uint64_t *out) {
    uint64_t limit = (1ULL << N) - 1;
    uint64_t v = (*p) & limit;          // 取前缀位
    if (v < limit) { *out = v; return 1; }
    uint64_t m = 0; int shift = 0, i = 1;
    do {
        uint8_t b = p[i++];
        m |= (uint64_t)(b & 0x7f) << shift;
        shift += 7;
    } while (p[i-1] & 0x80);            // 续传位为 1 则继续
    *out = limit + m;
    return i;
}
```

```python
# 伪代码：编码器写入一个带增量索引的新头部
def encode_literal_with_indexing(name, value, huffman=True):
    out = bytearray([0x40])                  # 前缀 01 + 索引 0 => 新名，增量入表
    out += encode_str(name, huffman)         # 名（可 Huffman）
    out += encode_str(value, huffman)        # 值（可 Huffman）
    return bytes(out)

# 伪代码：动态表环形逐出（插入前确保不超限）
def evict_to_fit(dyn, incoming):
    while dyn.size + incoming > S_max and dyn:
        dyn.pop_front()                       # 逐出最旧项（类 LRU）
    dyn.append(incoming)
```

## 五、与其他技术对比
| 维度 | HPACK | SPDY/zlib | gzip 压头 |
| --- | --- | --- | --- |
| 压缩上下文 | 单连接内、表隔离 | 共享压缩流 | 无状态 |
| 抗 CRIME | 强（永不索引 + 非共享） | 弱 | 弱 |
| 头部块分割 | 可跨 CONTINUATION 帧 | 整块 | 整块 |
| 跨连接复用 | 否 | 否 | 是 |

HPACK 的关键取舍是用「有状态表 + 禁止跨流共享」换取安全：它不追求压缩率的全局最优，而是确保攻击者无法借压缩长度推断他人头部值，为此放弃通用压缩器的更高压缩比。

## 六、常见误区
- 误区：HPACK 就是 gzip 压头部。错，gzip 有 CRIME 风险，HPACK 采用差分索引 + 字段级隔离。
- 误区：动态表跨连接共享。错，仅单连接有效，连接关闭即清空；这也是「绝不跨流共享」抗 CRIME 的基础。
- 误区：所有头部都可进表。错，敏感头部应标「永不索引」，否则可能被后续短索引探测。
- 误区：动态表越大越好。错，`SETTINGS_MAX_HEADER_TABLE_SIZE` 过大增加内存与首字节延迟，需结合复用率权衡。
- 误区：索引 0 合法。错，索引值 0 在 HPACK 中表示「空表示」或保留，不可引用。
- 误区：动态表不占内存。错，它按 `SETTINGS_MAX_HEADER_TABLE_SIZE` 占连接内存，高并发连接需监控总量。

## 七、与开源书·权威来源对应
- RFC 7541（HPACK: Header Compression for HTTP/2）——静态表、动态表、Huffman 码表的权威定义。
- RFC 9113（HTTP/2）——头部块在 HEADERS/CONTINUATION 帧中的承载与 `SETTINGS_MAX_HEADER_TABLE_SIZE`。
- Stevens《TCP/IP Illustrated》卷 1 对 HTTP 头部冗余的分析背景。
- Kurose & Ross《Computer Networking》第 2 章关于应用层协议效率的讨论。

## 八、面试题
1. HPACK 由哪三部分组成？各自解决什么？（静态表省常量、动态表省重复、Huffman 省字面量体积。）
2. 为什么不用 gzip/zlib 压缩整段头部？（CRIME：长度泄露可推断明文，HPACK 用字段级隔离 + 永不索引规避。）
3. 动态表满了如何淘汰？`SETTINGS_MAX_HEADER_TABLE_SIZE` 由谁设定？（环形逐出最旧项；由对端 SETTINGS 限定。）
4. 「永不索引」字面量用在哪些场景？（Cookie、Authorization 等敏感字段。）
5. HPACK 与 QPACK 最大区别？（QPACK 因 QUIC 乱序需解耦动态表与头部块。）

## 九、演进与趋势
QPACK（RFC 9204）为 HTTP/3/QUIC 设计：QUIC 流乱序到达使「动态表按序可达」假设失效，QPACK 因而将动态表拆分为「已确认」与「阻塞」两部分，并用独立指令流（encoder/decoder stream）解耦头部块与表更新。此外，HPACK 的 `MAX_HEADER_LIST_SIZE` 限制与流级背压也在持续细化，防止单个大头部列表拖垮连接；部分实现引入动态表大小自适应以匹配实际头部复用率。头部压缩正从「连接级状态」走向「按流确认的状态」，呼应 QUIC 的乱序世界。对实现者而言，动态表的命中率（hit ratio）是比压缩率更关键的观测指标。

## 十、小结
HPACK 通过静态表 + 动态表 + 字段级 Huffman，在单连接上下文内高效消除头部冗余。其真正精髓在于「有状态但隔离、可压缩但永不泄露」的设计，从机制上堵住 CRIME 类长度侧信道，是 HTTP/2 省带宽又安全的基石。

理解 HPACK 的取舍，也有助于正确配置 `SETTINGS_MAX_HEADER_TABLE_SIZE` 与决定敏感头部是否标「永不索引」，避免「省了带宽却漏了信息」。
