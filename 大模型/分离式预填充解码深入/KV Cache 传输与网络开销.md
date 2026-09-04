# KV Cache 传输与网络开销

> 对应 Ainslie 2023 GQA; Kwon 2023 vLLM; Dao 2022 FlashAttention。

## 一、背景与挑战
分离式要求 prefill 把 KV 传给 decode 实例，KV 体积随序列长度与层数线性增长，可能成为瓶颈。

## 二、核心原理
用 GQA 减少 KV 头数；传输时按块（paged）异步搬运，与 decode 启动重叠；高速 NVLink/InfiniBand 降低时延。

## 三、形式化与数学基础
KV 大小：
$ |KV| = 2 \cdot L \cdot n_{layers} \cdot n_{kv\_heads} \cdot d_{head} \cdot \text{prec} $
传输时延 ≈ |KV| / bandwidth。GQA 把 n_kv_heads 远小于 n_heads。

## 四、代码实现
```python
async def transfer(kv_blocks, dst):
    for blk in kv_blocks:
        await net.send(blk, dst)        # 分块异步传输
    signal_ready(dst)
```

## 五、与其他技术对比
同节点共享显存免传输；跨节点必须网络搬运，故 GQA + 压缩更关键。

## 六、常见误区
误区：KV 传输可忽略。长上下文下 KV 可达 GB 级，须显式优化。

## 七、与开源书/权威来源对应
Ainslie et al. 2023 GQA 减少 KV；vLLM 支持跨实例 KV。见 vllm-project/vllm。

## 八、面试题
问：GQA 如何帮助分离式？
答：减少 KV 头数直接缩小传输量，降低网络开销。

## 九、演进与趋势
KV 量化、压缩与拓扑感知放置进一步削减传输。

## 十、小结
KV 传输是分离式的代价项，靠 GQA、分页异步与高速网络压低。
