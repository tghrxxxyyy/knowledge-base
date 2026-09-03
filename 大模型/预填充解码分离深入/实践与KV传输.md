# 分离实践与 KV 传输

> 对应 KV 传输工程；与 KV缓存优化深入 / 量化推理引擎深入 衔接。

## 一、背景与挑战

跨实例传 KV 是分离架构关键成本，需高带宽低延迟链路。

## 二、核心原理

用 NVLink/RDMA 直传 KV 张量；可对 KV 量化（FP8/INT8）降传输量；采用 KV 缓存池统一调度避免重复。

## 三、数学形式

传输量 $B_{kv}=L\cdot n_{kv}\cdot d\cdot 2$ 字节/请求；量化 $b$ 位降至 $b/16$ 倍。

## 四、代码实现

```python
kv_q = quantize(kv, dtype=torch.float8)
send_over_nvlink(peer, kv_q)
```

## 五、与其他对比

- 与 量化推理引擎深入（KV 量化）直接复用；
- 与 PagedAttention深入 衔接（远程分页）。

## 六、常见误区

- KV 量化损长上下文质量；
- 传输与计算未流水重叠致空等。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 如何降 KV 传输成本？答：高带宽链路+量化+与计算流水重叠。

## 九、演进

CPU 转发 → NVLink → 量化+流水。

## 十、小结

KV 传输是分离架构命脉，需链路与量化协同优化。
