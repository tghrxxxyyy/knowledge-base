# LoRA 权重加载与切换

> 对应 Hu et al. 2021「LoRA」、Dettmers et al. 2023「QLoRA」与 huggingface/peft。

## 一、背景与挑战

生产环境中的适配器数量可能上千（多租户、多任务、多版本），全部常驻 GPU 显存并不现实。但请求是随机到达的，用户期望毫秒级响应，不能在每次请求时从磁盘慢慢加载。

核心挑战：在**显存容量有限**与**切换延迟敏感**之间取得平衡，让海量适配器「看起来」都在线。

## 二、核心原理

分层缓存 + 按需加载是标准答案：

- **GPU 常驻层**：热点适配器常驻显存，命中即用，零加载延迟。
- **CPU 内存层**：次热适配器驻留主机内存，通过 PCIe/NVLink 换入。
- **SSD/对象存储层**：海量冷适配器落盘，按需拉取。
- 请求携带 `adapter_id`，调度器在层计算前确保对应权重就位；未命中则触发加载并可能短暂阻塞（或异步预取避免阻塞）。
- 替换策略常用 LRU/LFU，配合请求模式预测做预取。

注意：LoRA 只加载增量矩阵 $A, B$，而非整个模型，因此单次换入的数据量远小于全模型加载。

## 三、形式化与数学基础

单次换入成本由数据量与链路带宽决定：

$$C_{swap} = \frac{|A| + |B|}{bw_{link}} + T_{bind}$$

其中 $|A| + |B| = r(k + d)$ 个元素（按精度换算字节），$T_{bind}$ 是挂载/绑定开销。目标是最小化总成本：

$$\min \sum_{t} C_{swap}(t) \quad \text{s.t.} \quad \sum_{a \in resident} M_a \le M_{GPU}$$

在 LRU 下，命中率 $h$ 由访问分布与容量决定；平均访问延迟为：

$$\bar{L} = h \cdot L_{hit} + (1 - h) \cdot (L_{miss} + C_{swap})$$

因此提升 $h$（更好的缓存策略/预取）比单纯加带宽更有效。

## 四、代码实现

一个带分层缓存的适配器管理器骨架。

```python
class AdapterCache:
    def __init__(self, gpu_cap, cpu_cap):
        self.gpu = {}          # gpu_resident: aid -> tensors
        self.cpu = {}          # cpu_resident: aid -> tensors
        self.gpu_lru = []      # 简化 LRU 顺序
        self.gpu_cap = gpu_cap
        self.cpu_cap = cpu_cap

    def load_from_disk(self, aid):
        # 从 SSD / 对象存储读取增量矩阵，具体格式随存储方案而定
        return read_adapter(aid)

    def ensure(self, aid):
        if aid in self.gpu:
            self._touch(aid)
            return self.gpu[aid]
        if aid not in self.cpu:                     # 冷数据：逐层上拉
            self.cpu[aid] = self.load_from_disk(aid)
            if len(self.cpu) > self.cpu_cap:
                self.cpu.pop(next(iter(self.cpu)))
        t = self.cpu[aid]
        while len(self.gpu) >= self.gpu_cap:         # 腾位
            victim = self.gpu_lru.pop(0)
            self.cpu[victim] = self.gpu.pop(victim)
        self.gpu[aid] = t.to_device()                # H2D 拷贝
        self.gpu_lru.append(aid)
        return self.gpu[aid]

    def _touch(self, aid):
        self.gpu_lru.remove(aid)
        self.gpu_lru.append(aid)
```

生产实现还需考虑异步拷贝、按层预取以及与批调度的协同。

## 五、与其他技术对比

| 方案 | 适配器规模 | 切换延迟 | 显存占用 | 运维复杂度 |
| --- | --- | --- | --- | --- |
| 每适配器独立模型 | 小 | 高（整模型加载） | ×N | 高 |
| 全量常驻 GPU | 中 | 零 | 高 | 低 |
| 分层缓存 + 按需换入 | 大（千级） | 毫秒级 | 可控 | 中 |
| 融合权重进基座 | 小 | 零 | 中 | 中 |

## 六、常见误区

- 误区一：切换零成本。PCIe 带宽有限，频繁换入仍可观，必须靠缓存命中和预取摊薄。
- 误区二：适配器越多越需要带宽。提升命中率（更好的替换/预取）通常比加带宽更划算。
- 误区三：可以边算边换。若权重未就位就启动计算会得到错误结果，需保证绑定完成的顺序。
- 误区四：LRU 总是最优。对有明显周期性或热点倾斜的负载，LFU 或预测式预取可能更好。

## 七、与开源书·权威来源对应

- Hu, E. et al. (2021)《LoRA》。
- Dettmers, T. et al. (2023)《QLoRA》，量化基座 + 适配器。
- huggingface/peft 的 adapter 管理接口。
- vllm-project/vllm 的多 LoRA 共驻与动态加载。

## 八、面试题

1. 如何降低切换延迟？答：预热热点、批内同适配器归并、异步预取、分层缓存。
2. 为什么只加载增量而不加载整模型？答：LoRA 增量为 $r(k+d)$，远小于基座参数量。
3. LRU 与 LFU 如何选？答：访问分布倾斜且稳定选 LFU，时间局部性强选 LRU。
4. 如何避免换入阻塞推理？答：异步 H2D 拷贝 + 调度器提前预取，或在等待时调度其他请求。

## 九、演进与趋势

分层缓存（GPU→CPU→SSD）已支持千级适配器共驻；部分系统支持跨节点共享适配器存储与 P2P 传输。适配器格式与加载路径趋向标准化，具体能力以各框架官方文档为准。

## 十、小结

权重加载与切换的效率，直接决定多 LoRA 服务可支撑的适配器规模。核心是三件事：只搬增量、分层缓存、按需预取。理解 $C_{swap} = (|A|+|B|)/bw_{link} + T_{bind}$，就能判断瓶颈在带宽还是在绑定开销。
