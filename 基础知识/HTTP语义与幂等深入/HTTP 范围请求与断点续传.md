# HTTP 范围请求与断点续传

> 对应 RFC 9110 第 14 节 Range 请求与 Kurose & Ross《Computer Networking》文件传输章节。

## 一、背景与挑战

大文件下载（系统镜像、视频）中，网络中断或客户端暂停不应导致从头再来。若每次都重传整个文件，既浪费带宽，又让弱网环境几乎不可用。

HTTP 范围请求（Range Request）允许客户端只获取资源的某段字节，从而实现断点续传、并行分片下载与视频拖动。它是可靠大文件传输的基础能力。

## 二、核心原理

- 客户端在请求中带 `Range: bytes=start-end`，支持三种形式：
  - `bytes=0-499`：前 500 字节。
  - `bytes=500-`：从 500 到末尾。
  - `bytes=-500`：最后 500 字节（后缀形式）。
- 服务器若支持，返回 `206 Partial Content`，并在 `Content-Range` 中声明范围与总长度；若不支持，则忽略 `Range` 返回 `200` 全量。
- `Accept-Ranges: bytes` 表示服务器支持范围请求，客户端可据此决定是否分片。
- 多范围请求可用 `multipart/byteranges` 在单个响应中返回多段。
- 范围请求要求资源具有稳定标识（通常配合强 ETag/Last-Modified），否则多段拼接可能对应不同版本。

## 三、形式化与数学基础

设资源总长度为 $N$，请求区间 $[a, b]$（0 基、含端点）。服务器返回：

$$Content\text{-}Range: bytes\ a\text{-}b/N$$

返回字节数为：

$$len = b - a + 1 \quad (b \text{ 显式给出})$$

若为开区间 $a-$，则：

$$len = N - a$$

后缀形式 $-k$ 表示最后 $k$ 字节：

$$[a, b] = [N-k,\ N-1], \quad len = k$$

若 $a \ge N$，服务器应返回 `416 Range Not Satisfiable` 并给出 `Content-Range: bytes */N`。并行分片下载把 $[0, N-1]$ 切成 $m$ 段，理论加速受最小段带宽与连接数限制。

## 四、代码实现

请求前 1024 字节。

```http
GET /big.iso HTTP/1.1
Host: example.com
Range: bytes=0-1023
```

服务器响应片段。

```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/1000000
Content-Length: 1024
Accept-Ranges: bytes

<前 1024 字节>
```

服务端的范围处理逻辑（以 Flask 为例）。

```python
def parse_range(header, total):
    # 解析 "bytes=start-end" 为 (start, end) 含端点
    unit, _, spec = header.partition("=")
    if unit.strip().lower() != "bytes":
        return None
    start_s, _, end_s = spec.partition("-")
    if start_s == "":                       # 后缀形式 -k
        k = int(end_s)
        return max(0, total - k), total - 1
    start = int(start_s)
    end = int(end_s) if end_s else total - 1
    if start >= total:
        return "unsatisfiable"
    return start, min(end, total - 1)
```

## 五、与其他技术对比

| 技术 | 续传机制 | 分片语义 | 备注 |
| --- | --- | --- | --- |
| HTTP Range | `Range`/`Content-Range` | 标准、可并行 | 应用最广 |
| FTP REST | REST 偏移 | 无统一分片 | 老协议，语义弱 |
| 对象存储分段上传 | 分片 + 完成提交 | 上传侧分片 | 下载仍用 Range |
| BitTorrent | 分片 + 校验 | 对等分片 | 去中心化分发 |

HTTP/3 的 Range 语义与 HTTP/1.1 一致，只是传输在 QUIC 流上进行。

## 六、常见误区

- 误区一：206 一定比 200 快。只有「只取所需段」才省流量；若取全量，206 未必更快。
- 误区二：范围请求会改变资源内容。它只按字节截取，不改变资源本身。
- 误区三：所有服务器都支持。需 `Accept-Ranges` 存在且实现正确，否则客户端应回退到 200 全量。
- 误区四：断点续传无需校验版本。跨版本拼接会产生损坏文件，应配合 ETag/Last-Modified 校验。

## 七、与开源书·权威来源对应

- RFC 9110 第 14 节，Range 与 Content-Range 的定义。
- RFC 7233（已被 9110 吸收），早期范围请求规范。
- Kurose & Ross《Computer Networking》，HTTP 文件传输与响应。
- 现代下载工具（如 aria2）文档中的多连接分片实践。

## 八、面试题

1. 206 与 200 的区别？答：206 是部分内容，带 Content-Range；200 是全量。
2. Content-Range 的格式？答：`bytes start-end/total`，不满足时用 `bytes */total`。
3. 如何用 Range 实现多线程下载？答：把文件切成若干字节区间，并发请求 206，按偏移拼接。
4. 服务器不支持时如何降级？答：忽略 Range 头的响应即为 200 全量，客户端据此回退单连接下载。

## 九、演进与趋势

现代下载器结合 Range 与多连接分片显著提升吞吐；视频流（HLS/DASH）在应用层做分片索引，底层仍可用 Range。HTTP/3 下范围请求在 QUIC 流上同样可用，语义不变。大文件上传侧则多采用分段上传 + 原子提交。

## 十、小结

范围请求通过 `bytes` 区间与 206 响应实现断点续传与分片下载，是可靠大文件传输的基础。正确使用需关注 `Accept-Ranges`、`Content-Range` 格式、416 边界处理，以及跨段拼接时的版本一致性。
