# 分布式追踪与Span上下文

> 对应 Sigelman 2010《Dapper, a Large-Scale Distributed Systems Tracing Infrastructure》、W3C Trace Context 规范与 OpenTelemetry Tracing 规范。

## 一、背景与挑战
单体时代，一次请求的日志落在一个文件里，grep 一把即可还原执行路径。微服务化之后，一次用户请求被拆成若干 RPC，跨越网关、业务服务、缓存、数据库与消息队列，日志被切碎在几十台机器上，问题定位变成「从海量日志里拼图」。

核心挑战可以归纳为三点。

- 因果断裂：服务 A 调用服务 B，A 的日志与 B 的日志各自独立，无法判断 B 这次报错究竟由哪一次上游请求触发。
- 延迟归属：一次请求耗时 800ms，聚合指标只能告诉你整体 P99 上涨，无法回答「这 800ms 里谁占了大头」。
- 成本约束：若把每次调用的起止时间都持久化，高 QPS 下存储与网络开销不可忽略，必须配合采样。

分布式追踪给出的答案是：给「同一次请求的所有处理片段」打上统一关联标识，并把它们组织成一棵树。

## 二、核心原理
追踪模型由 Trace 与 Span 两个概念构成。

- Trace：一次端到端请求的完整记录，由全局唯一的 trace_id 标识，属于该请求的所有 Span 共享同一个 trace_id。
- Span：一次具名、带时间戳的操作，例如「HTTP GET /cart」「redis GET」「SELECT orders」。每个 Span 拥有 span_id 与指向父级的 parent_span_id，从而构成树。
- 上下文传播（Context Propagation）：把 trace_id、span_id、采样标记等打包成请求头，随调用链向下游传递，使不同进程产生的 Span 能挂到同一棵树上。
- Span Kind 与属性：Span 用 kind 区分 server/client/producer/consumer/internal，用 attributes 记录状态码、peer 地址等语义字段。

跨进程传播依赖约定好的头部格式。W3C Trace Context 定义了 traceparent（含 version、trace-id、parent-id、trace-flags）与 tracestate（厂商扩展），OpenTelemetry 在其上定义了 Baggage 用于携带业务键值。

## 三、形式化与数学基础
将一次请求的追踪建模为树 $T = (V, E)$，节点 $v \in V$ 是一个 Span，边表示调用关系。根节点 $r$ 满足：

$$ trace\_id(v) = trace\_id(r),\quad \forall v \in V $$

父子关系用 parent 指针表达：

$$ parent(v) = p \iff parent\_span\_id(v) = span\_id(p) $$

每个 Span 的时间区间为 $[start_v, end_v]$，其自身耗时（self time）为：

$$ self(v) = (end_v - start_v) - \sum_{c \in children(v)} (end_c - start_c) $$

整条 Trace 的墙钟时长可近似为根节点区间：

$$ T_{trace} \approx end_r - start_r $$

若采用概率采样，设采样率 $p$，则单位时间上报 Span 数期望为 $N \cdot p$；采样决策必须在链路入口处一次性决定并随上下文传播，否则父子采样不一致会导致 Trace 残缺。聚合的延迟分布可用 Span 自身耗时的直方图近似，但要注意采样偏差。

## 四、代码实现
以 OpenTelemetry Python 为例，手动创建 Span 并读取上下文。

```python
from opentelemetry import trace

tracer = trace.get_tracer("checkout")

def handle_request(cart_id):
    # start_as_current_span 会把新 Span 设为当前上下文
    with tracer.start_as_current_span("checkout") as root:
        root.set_attribute("cart.id", cart_id)
        charge(cart_id)

def charge(cart_id):
    # 这里取到的当前 Span 已是 checkout 的子节点
    with tracer.start_as_current_span("pay.charge") as sp:
        sp.set_attribute("payment.channel", "card")
        sp.add_event("retry", {"attempt": 1})
        do_charge(cart_id)
```

跨进程场景下，框架会自动注入与提取头部；若手工实现 HTTP 调用，可显式注入：

```python
from opentelemetry.propagate import inject, extract

# 发起方：把当前上下文写入 header
headers = {}
inject(headers)          # 得到 traceparent 等字段
http_post(url, headers=headers)

# 接收方：从 header 还原上下文，再启动子 Span
ctx = extract(incoming_headers)
with tracer.start_as_current_span("handle", context=ctx):
    process()
```

关键点在于：注入与提取必须成对出现，任何一跳漏掉传播，Trace 就会在这一跳断裂成碎片。

## 五、与其他技术对比

| 维度 | 分布式追踪 | 指标（Metrics） | 日志（Logs） |
| --- | --- | --- | --- |
| 数据粒度 | 单次请求明细 | 聚合数值 | 离散事件 |
| 因果与层级 | 自带，树形还原 | 无 | 需依赖 trace_id 关联 |
| 存储成本 | 高，通常需采样 | 低 | 中到高 |
| 典型问题 | 跨服务延迟归属 | 容量与趋势告警 | 具体错误内容 |
| 查询方式 | 按 trace_id 检索 | 按维度聚合 | 全文/结构化检索 |

三者不是替代关系：指标负责「发现异常」，追踪负责「定位到哪一跳」，日志负责「看清这一跳发生了什么」。

## 六、常见误区
- 上下文传播缺失：只在入口创建 Span，跨进程未注入 header，导致每次调用都是孤立的单节点 Trace。
- 把大对象塞进 Span 属性：写入整个请求体或结果集，既膨胀存储又可能泄露敏感数据。
- 父子采样不一致：下游自行决定采样，出现「父 Span 留存、子 Span 丢弃」的孤儿节点。

## 七、与开源书·权威来源对应
- Google Dapper 论文（Sigelman 等，2010）确立了 trace/span/parent 的基本模型与低开销采样的工程做法。
- W3C Trace Context 规范定义了 traceparent/tracestate 的标准头部格式。
- OpenTelemetry Tracing 规范定义了 Span 的数据模型、SpanKind、Status 与语义约定。
- 《Designing Data-Intensive Applications》（Kleppmann）讨论了时间、因果与可观测性的关系。

## 八、面试题
1. trace_id 与 span_id 分别解决什么问题？为什么两者都需要？
2. 上下文传播失败会怎样？如何排查一条 Trace 为何「断链」？
3. Span 的 self time 如何计算？为什么它比总时长更能定位热点？
4. 采样有哪些策略？为什么采样决策必须随上下文传播？
5. SpanKind 的 server 与 client 有何区别，对语义约定有什么影响？

## 九、演进与趋势
- 无侵入采集：eBPF 与内核态插桩可在不修改业务代码的前提下产出 Span。
- 语义约定标准化：OpenTelemetry Semantic Conventions 持续收敛各领域属性命名。

## 十、小结
分布式追踪用统一的 trace_id 与父子 span_id 把分散在各服务中的处理片段还原成因果链，通过上下文传播跨越进程边界。指标负责发现、追踪负责定位、日志负责解释，三者共同构成可观测性的基本盘。工程上要守住两条底线：传播不能断，采样要一致。
