# HTTP2与HTTP3对缓存的影响

> 对应 RFC 9113 (HTTP/2)、RFC 9114 (HTTP/3) 与 RFC 7234（缓存语义不变）；参考 xiaolincoder/hello-http。

## 一、背景与挑战
HTTP/2、HTTP/3 改变的是传输，缓存语义（Cache-Control 等）基本不变，但多路复用与头部压缩间接影响缓存效率。

## 二、核心原理
- 多路复用：单连接并发多请求，减少连接级竞争，缓存命中更快生效。
- 头部压缩（HPACK/QPACK）：减少重复头开销，协商缓存请求更轻。
- 0-RTT（HTTP/3）：缓存验证请求首包即可发，降低回源延迟。

## 三、形式化与数学基础
HTTP/2 头阻塞消除后，单资源未命中不再阻塞其他资源验证：
  parallel_validate = min(streams, RTT)
QPACK/HPACK 压缩率：
  header_bytes ≈ base - encoded_static - dynamic_table_hits

## 四、代码实现
# 配置 Nginx 同时支持 h2/h3 与缓存
server {
    listen 443 ssl http2;
    http3 on;
    add_header Cache-Control "max-age=3600";
    ssl_early_data on; # 0-RTT
}

## 五、与其他技术对比
缓存语义跨版本兼容，但 HTTP/3 的 0-RTT 与连接迁移让边缘缓存体验更顺滑。

## 六、常见误区
1. 认为换了 HTTP/3 就要改缓存头——无需。
2. 忽略 0-RTT 下 304 验证可能重放，需幂等。

## 七、与开源书/权威来源对应
- RFC 9113 / RFC 9114
- RFC 7234
- xiaolincoder/hello-http

## 八、面试题
HTTP/3 改变缓存语义了吗？多路复用如何影响缓存？

## 九、演进与趋势
缓存与传输解耦，未来重点在边缘可编程缓存。

## 十、小结
HTTP/2、HTTP/3 优化的是传输，缓存头与新鲜度模型保持向后兼容。
