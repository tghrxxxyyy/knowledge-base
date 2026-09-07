# HTTP缓存头详解

> 对应 RFC 7234 (HTTP/1.1 Caching) 与 Fielding 1999 (REST/HTTP 架构)；参考 xiaolincoder/hello-http。

## 一、背景与挑战
Web 性能高度依赖缓存。正确的缓存头能减少带宽与延迟，错误配置会导致用户看到陈旧内容或重复下载。

## 二、核心原理
关键响应头：
- Cache-Control：max-age、no-cache、no-store、must-revalidate、public/private。
- Expires：绝对过期时间（已被 Cache-Control 取代）。
- ETag / Last-Modified：验证器，用于协商缓存。
- Vary：按请求头区分缓存变体。

## 三、形式化与数学基础
强缓存命中条件：
  now < response_time + max-age
协商缓存新鲜度：
  if (If-None-Match == ETag) return 304
  else if (If-Modified-Since >= Last-Modified) return 304

## 四、代码实现
# 服务端设置缓存头（Python Flask 示例）
from flask import Response
@app.route("/static/app.js")
def app_js():
    r = Response(JS)
    r.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    r.headers["ETag"] = sha1(JS).hexdigest()
    return r

## 五、与其他技术对比
max-age 是相对时间更可靠；Expires 受时钟漂移影响；no-cache 仍可协商，no-store 完全不缓存。

## 六、常见误区
1. 认为 no-cache 不缓存——它只是每次需验证。
2. 忽略 Vary: User-Agent 会爆炸式增加缓存条目。

## 七、与开源书/权威来源对应
- RFC 7234 (HTTP Caching)
- Fielding 1999 (Architectural Styles and REST)
- xiaolincoder/hello-http

## 八、面试题
max-age 与 Expires 区别？no-cache vs no-store？ETag 作用？

## 九、演进与趋势
Cache-Control: immutable 减少无谓重验证；HTTP/3 下缓存语义不变。

## 十、小结
缓存头是性能与正确性的杠杆，理解新鲜度与验证机制是前端/后端基本功。
