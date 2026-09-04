# In-flight Batching 实现

> 对应 NVIDIA/TensorRT-LLM; Kwon 2023 vLLM; Ainslie 2023 GQA。

## 一、背景与挑战
传统静态批处理要等整批结束，长请求拖累短请求。In-flight batching 即 TRT-LLM 的连续批处理实现。

## 二、核心原理
在解码循环内，每生成一个 token 就重新组批：完成的序列释放槽位，新请求插入，未完成的继续。配合分页 KV 管理。

## 三、形式化与数学基础
每步活跃集合 B_t 动态变化，批次利用率：
$ U = \frac{\sum_i \text{active}_i}{N_{slots}} \to \text{接近 }1 $

## 四、代码实现
```python
while scheduler.has_requests():
    batch = scheduler.get_batch()      # 动态组批
    logits = engine.step(batch)
    scheduler.update(batch, logits)    # 推进/完成/接入
```

## 五、与其他技术对比
与 vLLM 连续批处理理念一致，区别在 TRT-LLM 于编译引擎内调度，延迟更低。

## 六、常见误区
误区：in-flight 与静态批可混用。需统一调度路径，否则语义错乱。

## 七、与开源书/权威来源对应
TRT-LLM in-flight batching 文档；Kwon 2023 vLLM。见 NVIDIA/TensorRT-LLM。

## 八、面试题
问：in-flight batching 如何提升吞吐？
答：逐 token 重组批，避免空等，GPU 始终满载不同进度序列。

## 九、演进与趋势
与分离式 prefill/decode 结合，进一步稳延迟。

## 十、小结
In-flight batching 把连续批处理落到高性能引擎层，是 TRT-LLM 吞吐关键。
