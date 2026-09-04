# LoRA 权重加载与切换

> 对应 Hu 2021 LoRA; Dettmers 2023 QLoRA; huggingface/peft。

## 一、背景与挑战
适配器数量可能上千，全部驻留显存不现实，需在请求到来时快速换入换出。

## 二、核心原理
维护适配器缓存池，热点常驻 GPU，冷适配器存 CPU/磁盘。请求携带 adapter_id，调度器确保对应权重在层计算前就位。

## 三、形式化与数学基础
切换成本：
$ C_{swap} = \frac{|A|+|B|}{bw_{pci}} + T_{bind} $
目标最小化 ∑C_swap 通过 LRU 缓存。

## 四、代码实现
```python
def ensure_adapter(cache, aid):
    if aid not in cache.gpu:
        w = cache.load(aid)            # 从 CPU 载入
        cache.bind(w)
    return cache.get(aid)
```

## 五、与其他技术对比
每次重建模型不可行；原地绑定增量矩阵实现毫秒级切换。

## 六、常见误区
误区：切换零成本。PCIe 带宽有限，频繁换入仍可观，需缓存。

## 七、与开源书/权威来源对应
PEFT 提供 adapter 管理；vLLM 支持 LoRA 共驻。见 huggingface/peft。

## 八、面试题
问：如何降低切换延迟？
答：预热热点、批内同适配器归并、异步预取。

## 九、演进与趋势
分层缓存（GPU→CPU→SSD）支持海量适配器。

## 十、小结
权重加载与切换的效率决定多LoRA服务的可行适配器规模。
