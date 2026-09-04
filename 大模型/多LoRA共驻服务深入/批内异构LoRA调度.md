# 批内异构LoRA调度

> 对应 Hu 2021 LoRA; Kwon 2023 vLLM; huggingface/peft。

## 一、背景与挑战
同一批次可能含不同适配器请求，朴素逐请求切换权重串行低效，需批内并行应用多套增量。

## 二、核心原理
把同层不同适配器的增量按序列分组计算，或把 A_i B_i 拼成批矩阵一次完成。vLLM 采用“分组 GEMM”统一处理批内异构 LoRA。

## 三、形式化与数学基础
批内序列集合按 adapter 分桶 {S_a}。层输出：
$ H = XW^\top + \sum_a s_a (X_{S_a} A_a^\top) B_a^\top $

## 四、代码实现
```python
def batched_lora(X, W, groups):
    out = X @ W.T
    for aid, idx in groups.items():
        A, B, s = adapters[aid]
        out[idx] += s * (X[idx] @ A.T) @ B.T
    return out
```

## 五、与其他技术对比
逐请求切换串行慢；分组批算把异构增量并行化，接近同适配器开销。

## 六、常见误区
误区：异构批一定慢很多。分组 GEMM 使其开销可控。

## 七、与开源书/权威来源对应
vLLM LoRA 支持批内多适配器。见 vllm-project/vllm、huggingface/peft。

## 八、面试题
问：批内异构 LoRA 如何实现高效？
答：按适配器分桶，做分组矩阵乘，避免重复切换。

## 九、演进与趋势
更细粒度（甚至 token 级）LoRA 路由正在探索。

## 十、小结
批内异构调度是多LoRA服务高吞吐的关键工程点。
