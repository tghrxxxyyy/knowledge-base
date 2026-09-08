# 条件请求与 ETag 校验

> 对应 RFC 7232（现并入 RFC 9110）条件请求与 ETag 以及 xiaolincoder/hello-http 的缓存校验说明。

## 一、背景与挑战
客户端缓存了资源后，如何判断服务器版本是否已变、避免重复下载、或避免并发修改覆盖？条件请求通过实体标签（ETag）或最后修改时间提供「乐观并发」与「增量校验」机制。

## 二、核心原理
服务器为资源生成 ETag（强校验或弱校验，「W/」前缀表示弱）。客户端在后续请求带 If-None-Match（用于 GET 校验新鲜度，命中返回 304）或 If-Match（用于 PUT/DELETE 乐观锁，不匹配返回 412）。Last-Modified 与 If-Modified-Since 为基于时间的等价机制，但精度与语义弱于 ETag。

## 三、形式化与数学基础
强 ETag 满足：资源任意字节变化则 ETag 必变，且同一 ETag 保证字节级一致。弱 ETag 仅表达「语义等价」。条件判断：若 If-None-Match 的值等于当前 ETag，则 304；若 If-Match 不匹配且资源已改，则 412 Precondition Failed。

## 四、代码实现
```python
etag = compute_etag(resource)
if request.headers.get("If-Match") == etag:
    update(resource)
    return 204
else:
    return 412  # 并发修改冲突
```

## 五、与其他技术对比
ETag 比 Last-Modified 更精确（可识别亚秒变化、内容等价但时间变的情况）；数据库乐观锁（version 字段）是应用层等价物。分布式下 ETag 需全局一致生成（如内容哈希或版本号）。

## 六、常见误区
误区一：ETag 必须是哈希——可以是任意能标识版本的值（如版本号）。误区二：弱 ETag 不能用于并发控制——确实不适合，应用锁要用强 ETag。误区三：304 不带 body——正确，但需保留原缓存。

## 七、与开源书/权威来源对应
RFC 9110 第 13 节定义条件请求与 ETag；xiaolincoder/hello-http 给出 304 抓包；Kleppmann《DDIA》讨论乐观并发控制。

## 八、面试题
强 ETag 与弱 ETag 区别？If-Match 与 If-None-Match 用途？为什么 ETag 优于 Last-Modified？412 含义？

## 九、演进与趋势
在对象存储（S3 等）中 ETag 常是内容 MD5/CRC，配合 If-Match 实现分片上传的原子提交；HTTP 语义层持续强调 ETag 作为并发控制基石。

## 十、小结
条件请求以 ETag 为核心，提供缓存校验与乐观并发控制两类能力，是构建正确、高效 HTTP 接口的关键工具。
