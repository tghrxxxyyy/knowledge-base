# 条件请求与 ETag 校验

> 对应 RFC 9110《HTTP Semantics》第 13 节条件请求与 RFC 9111《HTTP Caching》。

## 一、背景与挑战

客户端缓存了资源后，面临两个问题：

1. **新鲜度校验**：服务器版本是否已变？若未变，能否避免重复传输？
2. **并发控制**：多个客户端同时修改同一资源，如何避免后写覆盖先写（lost update）？

条件请求用实体标签（ETag）或最后修改时间提供答案：前者是「乐观并发」与「增量校验」的统一机制，把「带条件的操作」交给服务器原子判定。

## 二、核心原理

- 服务器为资源生成 **ETag**。强 ETag 保证字节级一致；弱 ETag 以 `W/` 为前缀，仅表达「语义等价」。
- 客户端在后续请求携带条件头：
  - `If-None-Match`：GET 校验新鲜度，命中（值相同）返回 `304 Not Modified`。
  - `If-Match`：PUT/DELETE 乐观锁，不匹配返回 `412 Precondition Failed`。
  - `If-Modified-Since` / `If-Unmodified-Since`：基于时间的等价机制，精度与语义弱于 ETag（秒级、易受时钟影响）。
- 判定在服务器端原子完成，因此天然避免「检查-再写入」的竞态。

## 三、形式化与数学基础

强 ETag 满足两个方向的一致性：

$$bytes(R) = bytes(R') \iff ETag(R) = ETag(R')$$

弱 ETag 只保证单向：

$$semantics(R) = semantics(R') \Longrightarrow ETag_{weak}(R) = ETag_{weak}(R')$$

条件判定可写为：

$$
\begin{aligned}
& \text{If-None-Match}: \quad ETag_{cur} \in match\_list \Rightarrow 304 \\
& \text{If-Match}: \quad ETag_{cur} \notin match\_list \Rightarrow 412
\end{aligned}
$$

基于时间的校验误差受时钟分辨率 $\delta$ 限制，通常 $\delta = 1s$，故无法识别亚秒级变化。

## 四、代码实现

用强 ETag 做乐观并发控制的更新接口。

```python
import hashlib

def compute_etag(body_bytes: bytes) -> str:
    # 内容哈希作为强 ETag（版本号亦可，只要能唯一标识版本）
    return '"' + hashlib.sha256(body_bytes).hexdigest()[:16] + '"'

@app.put("/doc/<doc_id>")
def update_doc(doc_id):
    cur = load(doc_id)
    cur_etag = compute_etag(cur)
    if_match = request.headers.get("If-Match")
    if if_match != cur_etag:
        return Response(status=412)      # 并发修改冲突，客户端需重新获取
    save(doc_id, request.data)
    new_etag = compute_etag(request.data)
    return Response(status=204, headers={"ETag": new_etag})
```

读取端用 `If-None-Match` 命中缓存。

```python
@app.get("/doc/<doc_id>")
def get_doc(doc_id):
    body = load(doc_id)
    etag = compute_etag(body)
    if request.headers.get("If-None-Match") == etag:
        return Response(status=304, headers={"ETag": etag})  # 无 body
    return Response(body, headers={"ETag": etag})
```

## 五、与其他技术对比

| 机制 | 精度 | 语义强度 | 适用场景 |
| --- | --- | --- | --- |
| 强 ETag | 字节级 | 最强 | 缓存校验、并发控制 |
| 弱 ETag | 语义级 | 中 | 只读缓存校验 |
| Last-Modified | 秒级 | 弱 | 旧客户端兼容 |
| 数据库 version 字段 | 行级 | 强 | 应用层乐观锁 |

对象存储（如 S3 风格）常把 ETag 定义为内容哈希，配合 `If-Match` 实现分片上传的原子提交。

## 六、常见误区

- 误区一：ETag 必须是哈希。它可以是版本号、时间戳组合等任何能标识版本的值。
- 误区二：弱 ETag 可用于并发控制。弱 ETag 只表达语义等价，做互斥锁会漏判，应用强 ETag。
- 误区三：304 可以带新 body。304 无 body，客户端需保留原有缓存内容。
- 误区四：ETag 天然全局一致。分布式部署需保证同一资源在多节点生成同一 ETag（如统一内容哈希）。

## 七、与开源书·权威来源对应

- RFC 9110 第 13 节，条件请求与 ETag 的权威定义。
- RFC 9111《HTTP Caching》，缓存校验与新鲜度模型。
- Kleppmann《Designing Data-Intensive Applications》中乐观并发控制与版本号。
- xiaolincoder/hello-http 中 304 抓包示例（入门参考）。

## 八、面试题

1. 强 ETag 与弱 ETag 的区别？答：强 ETag 保证字节一致，弱 ETag 只保证语义等价。
2. `If-Match` 与 `If-None-Match` 的用途？答：前者用于写乐观锁（412），后者用于读缓存校验（304）。
3. 为什么 ETag 优于 Last-Modified？答：可识别亚秒变化，且不受「内容等价但时间变」的干扰。
4. 412 的含义？答：前置条件失败，说明客户端基于的版本已过期，应重新获取。

## 九、演进与趋势

对象存储与 CDN 广泛把 ETag 作为并发控制与缓存基座；边缘缓存与 `stale-while-revalidate` 等指令让校验策略更精细。HTTP 语义层持续强调 ETag 作为「带条件操作」的统一原语。

## 十、小结

条件请求以 ETag 为核心，同时提供缓存校验（304）与乐观并发控制（412）两类能力。理解强/弱 ETag 的语义差异，是构建正确、高效 HTTP 接口的关键。
