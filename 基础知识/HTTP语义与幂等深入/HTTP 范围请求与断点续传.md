# HTTP 范围请求与断点续传

> 对应 RFC 9110 第 14 节 Range 请求与 xiaolincoder/hello-http 关于断点续传的说明。

## 一、背景与挑战
大文件下载（镜像、视频）中，网络中断不应从头再来。HTTP 范围请求允许客户端只获取资源的某段字节，从而实现断点续传与并行分片下载。

## 二、核心原理
客户端在请求带 Range: bytes=start-end（含形式如 0-499、500-、-500 后缀）。服务器若支持，返回 206 Partial Content 并在 Content-Range 标明范围与总长度；若不持支持则返回 200 全量。Accept-Ranges: bytes 头部表示服务器支持范围请求。

## 三、形式化与数学基础
请求区间 [a, b]（0 基，含端点），服务器返回 Content-Range: bytes a-b/total，返回字节数为 b-a+1（当 b 指定）。若仅给 a-，则到末尾，长度 = total-a。多范围可用 multipart/byteranges 一次返回多段。

## 四、代码实现
```http
GET /big.iso HTTP/1.1
Range: bytes=0-1023
```
```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/1000000
Content-Length: 1024
```

## 五、与其他技术对比
FTP 的 REST 命令也支持续传但无统一分片语义；对象存储（S3）用 Range 头实现分段下载与视频拖拽。QUIC/HTTP/3 的范围请求语义与 HTTP/1.1 一致。

## 六、常见误区
误区一：206 一定比 200 快——只取所需段才省。误区二：范围请求改变内容——只截取，不改变资源。误区三：所有服务器支持——需 Accept-Ranges 存在且实现正确，否则回退 200。

## 七、与开源书/权威来源对应
RFC 9110 第 14.1/14.2 节定义 Range/Content-Range；xiaolincoder/hello-http 给出下载工具续传示例；Kurose & Ross 提及 HTTP 文件传输。

## 八、面试题
206 与 200 区别？Content-Range 格式？如何用 Range 实现多线程下载？不支持时如何降级？

## 九、演进与趋势
现代下载器（如 aria2）结合 Range 与多连接分片极大提升吞吐；HTTP/3 下范围请求在 QUIC 流上同样可用，语义不变。

## 十、小结
范围请求通过 bytes 区间与 206 响应实现断点续传与分片下载，是可靠大文件传输的基础能力。
