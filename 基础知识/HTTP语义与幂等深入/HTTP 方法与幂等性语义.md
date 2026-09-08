# HTTP 方法与幂等性语义

> 对应 RFC 7230/7231（现 RFC 9110）关于方法与幂等性的定义，及 xiaolincoder/hello-http 的语义说明。

## 一、背景与挑战
HTTP 定义了一组方法（GET、POST、PUT、DELETE、PATCH 等），其中「安全」与「幂等」是两条关键语义属性。正确理解和运用它们，是构建可重试、可缓存、可预测的 Web API 的基础。

## 二、核心原理
安全方法（GET、HEAD、OPTIONS、TRACE）语义上不修改服务器资源状态。幂等方法指「同一次请求执行一次与执行多次对服务器状态产生相同效果」——包括 GET、HEAD、PUT、DELETE、OPTIONS、TRACE，而 POST 与 PATCH 通常不幂等。注意幂等针对「对服务器状态的副作用」，不要求响应体相同。

## 三、形式化与数学基础
设操作 f 作用于状态 S，幂等要求 f(f(S)) = f(S)；对请求序列 R 重复应用满足 S_after(执行 R n 次) = S_after(执行 R 1 次)，n >= 1。安全要求 f(S) = S（状态不变），是幂等的特例。

## 四、代码实现
```python
# 幂等删除：多次删除同一资源结果一致
@app.route("/order/<id>", methods=["DELETE"])
def delete_order(id):
    if exists(id):
        remove(id)
    return "", 204   # 无论是否已删，结果一致
```

## 五、与其他技术对比
RPC 风格常把所有操作映射为 POST，丢失了方法语义；RESTful 强调用正确的方法与幂等性表达意图。gRPC 在 proto 层无内建幂等语义，需业务自行保证。

## 六、常见误区
误区一：幂等等于响应相同——只要求副作用一致。误区二：POST 永远不幂等——业务可通过唯一键做到幂等。误区三：GET 绝对安全——实现 bug 也可能改状态，违反规范。

## 七、与开源书/权威来源对应
RFC 9110 第 9 节定义方法与「safe」「idempotent」；xiaolincoder/hello-http 给出方法对照表；Kleppmann《DDIA》在「幂等」章节讨论重试安全。

## 八、面试题
哪些方法幂等？幂等与安全的区别？如何把 POST 做成幂等？为什么 DELETE 是幂等？

## 九、演进与趋势
HTTP 语义在 RFC 9110 中统一整理；一些 API 规范（如 JSON:API）明确约定幂等键（Idempotency-Key）头来显式保证写操作幂等。

## 十、小结
幂等性是 HTTP 方法语义的核心属性，理解「副作用一致而非响应一致」能帮助设计可安全重试的接口。
