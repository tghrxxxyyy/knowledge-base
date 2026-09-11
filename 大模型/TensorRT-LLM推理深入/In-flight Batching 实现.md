# In-flight Batching 实现

> 对应 NVIDIA/TensorRT-LLM in-flight batching 文档，以及 Kwon 2023《vLLM》、Ainslie 2023《GQA》等连续批处理与注意力研究。

## 一、背景与挑战

传统静态批处理（static batching）要等整批所有序列都生成完毕才返回，长请求拖垮短请求，GPU 在等待时空转。LLM 解码是逐 token 自回归，序列长度与终止时间差异大，静态批利用率低。In-flight batching（连续批处理）是 TRT-LLM 的解法。

挑战：(1) 每步都要重排活跃序列与 KV 槽位；(2) KV cache 分页避免碎片；(3) 调度需与引擎内核协同，避免拷贝开销。

## 二、核心原理

在解码循环内，每生成一个 token 后重新组批：已完成的序列释放 KV 槽位，新到达请求插入空槽，未完成的继续推进。这样 GPU 每步都在服务一批「进度不同」的序列，几乎无空等。配合分页 KV 管理（类似 vLLM 的 PagedAttention），KV 块按需分配，消除预留浪费。

TRT-LLM 在编译引擎层内置调度器（Scheduler），运行期通过 `recv/send` 与引擎 step 交互；也可经 Triton backend 暴露。GQA 减少每序列 KV 头数，使单步批更大。

实现上，调度器维护三个队列：等待、运行、完成。每步从 running 取仍在生成的序列组成当前批，并把 waiting 中不超过 KV 预算的请求补充进来。长度归零或命中 stop token 的序列移入 finished 并释放其 KV 页。这种「按 token 步而非按请求」的调度，是吞吐优于静态批的根本原因。分页 KV 是 in-flight 的前提：把每序列的 KV 按固定大小块分配，块可被不同序列在生命周期内复用。没有分页，长尾请求会让 KV 预算被大量预留空洞浪费，in-flight 的优势无法发挥。调度还需处理前缀缓存：相同 system prompt 的多个请求可共享前缀 KV 块，进一步省显存与计算。配合 chunked context，长 prefill 也被切成块进入批，使 prefill 与 decode 在同一引擎内混合调度，延迟更稳。工程实现上，TRT-LLM 的 Scheduler 与 KVCacheManager 位于 C++ 侧，Python 只负责提交请求与读取结果。若强行在 Python 层拷贝 KV 或做组批，性能会断崖式下降，这也是它优于纯 Python 连续批框架的底层原因。调度还需处理优先级：可按到达时间或 SLO 给请求加权，保证延迟敏感请求优先解码。KV 页回收采用引用计数，所有引用释放后才归还池，避免竞态下的悬空访问。在实际负载下，in-flight 的批次利用率可达 90% 以上，而静态批常因最长序列空转在 50% 以下。与分离式 prefill/decode 结合后，prefill 阶段独立成批、decode 阶段走 in-flight，进一步压低尾延迟。一个常见误区是以为 in-flight 吞吐无上限：实际受 KV 预算、最大批大小与单步 kernel 时间共同约束。当请求含流式输出时，in-flight 还需维护每请求的流式偏移，确保 token 按序返回且不互相阻塞。综上，in-flight batching 的本质是把「请求级批处理」下沉为「token 级调度」，配合分页 KV 实现高利用率。

从请求生命周期看，in-flight 把「一批请求同时开始同时结束」的松耦合，变成「每个 token 独立调度」的细粒度控制。
这对长短请求混合的流量尤其有利：短请求快速离开释放槽位，长请求持续占用但不阻塞他人。
调度器还需处理「生成长度未知」：无法预分配，只能按步扩展 KV 块，因此分页管理不可或缺。
前缀缓存进一步放大收益：多数对话共享相同系统提示，其 KV 块可被该用户的所有轮次复用。
在引擎实现上，每步 step 的输入是「当前活跃批的 token 与各自 KV 指针」，输出是 logits 与新的 KV 块。
为降低 Python 开销，TRT-LLM 在 C++ 侧完成组批与 KV 管理，仅向上暴露提交/取结果接口。
配合 chunked context，长 prompt 的 prefill 也被切成块，与 decode token 同批调度，避免长 prefill 独占 GPU。
观察指标应关注「槽位利用率」与「批内长度方差」：利用率高说明调度有效，方差大说明需分页兜底。
一个常见误区是认为 in-flight 吞吐无上限：它受 KV 预算、最大批大小与单步 kernel 时间共同约束。
流式输出时还需维护每请求的流式偏移，确保 token 按序返回且不互相阻塞。
与分离式 prefill/decode 结合后，prefill 独立成批、decode 走 in-flight，可进一步压低尾延迟。
综上，in-flight batching 的本质是把请求级批处理下沉为 token 级调度，配合分页 KV 实现高利用率。
当流量稀疏时，in-flight 退化为类静态批，此时重点在降低单请求延迟而非吞吐。
排查 in-flight 性能问题应优先看队列等待与 KV 碎片率，而非单纯看 GPU 利用率。

## 三、形式化与数学基础

设时刻 $t$ 活跃序列集合 $B_t$ 随请求到达/完成动态变化。批次槽位数 $N_{\mathrm{slots}}$ 固定，利用率：

$$U_t = \frac{\sum_{i\in B_t} \mathrm{len}_i}{N_{\mathrm{slots}} \cdot L_{\max}} \to 1$$

静态批下，整批需等最长序列结束，平均空转正比于 $\max_j \mathrm{len}_j - \bar{\mathrm{len}}$；in-flight 下，每步完成即释放，空转趋近于 0。吞吐约提升为批内长度方差的倒数级别（视分布）。

## 四、代码实现

示意调度循环（概念性，非逐字段 API）：

```python
while scheduler.has_requests() or scheduler.active():
    batch = scheduler.get_batch()      # 动态组批：插入新请求、剔除完成
    logits = engine.step(batch)        # 单步解码，内部用当前 KV 页
    scheduler.update(batch, logits)    # 推进 token、标记完成、回收 KV 页
    for req in scheduler.completed():
        emit(req)                      # 流式返回已完成的序列
```

注意：真实 TRT-LLM 用 `tensorrt_llm.bindings` 中的 `TrtGptModel` 与 `Scheduler` 类，KV 页由 `KVCacheManager` 统一管理，切勿在 Python 层手动拷贝 KV 以免性能崩塌。

## 五、与其他技术对比

| 策略 | 组批时机 | 空等 | 实现层 |
|------|----------|------|--------|
| 静态批 | 整批结束 | 多 | 任意 |
| vLLM 连续批 | 每步 | 少 | Python 调度 |
| TRT-LLM in-flight | 每步 | 少 | 编译引擎内 |

## 六、常见误区

- 认为 in-flight 可与静态批混用：需统一调度路径，否则 KV 槽位语义错乱。
- 忽视 KV 碎片：不用分页会在长尾请求下 OOM。
- 把「批大小」当「并发」：并发受 KV 预算与 max_batch_size 双重约束。
- 误以为零空等：调度与通信仍有微小开销。

## 七、与开源书·权威来源对应

- NVIDIA/TensorRT-LLM in-flight batching 文档与示例。
- Kwon et al. 2023《vLLM》——PagedAttention 与连续批处理。
- Ainslie et al. 2023《GQA》——降低 KV 带宽以放大批。

## 八、面试题

- in-flight batching 相比静态批如何提升吞吐？
- 为何需要分页 KV 配合 in-flight？
- TRT-LLM 的 in-flight 与 vLLM 连续批处理有何异同？

## 九、演进与趋势

与分离式 prefill/decode 结合，prefill 与 decode 用不同批策略进一步稳延迟；chunked context 让长 prefill 也能进批。具体以官方最新文档为准。

理解 in-flight 与静态批的本质差异，是评估推理框架选型的关键维度。
它在长尾请求混合流量下收益最大，而在均匀短请求下优势有限。
生产调优时建议同时观测吞吐与 P99，避免只优化均值而牺牲长尾体验。
当配合分离式部署，in-flight 还能与 prefill 池解耦，进一步提升整体弹性。
对延迟极敏感场景，in-flight 的逐 token 调度比整批等待更契合 SLA。

## 十、小结

In-flight batching 把连续批处理落到高性能引擎层，逐 token 重组批、配合分页 KV，是 TRT-LLM 高吞吐的关键机制；它要求调度与引擎、KV 管理协同设计。
