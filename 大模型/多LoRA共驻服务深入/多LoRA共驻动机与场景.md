# 多LoRA共驻动机与场景

> 对应 Hu et al. 2021「LoRA」、Dettmers et al. 2023「QLoRA」与 huggingface/peft。

## 一、背景与挑战

为每个任务或每个租户部署一份独立微调模型，成本随数量线性增长：显存 ×N、加载时间 ×N、运维对象 ×N。而现实中大量任务是「同底座、轻定制」——客服话术、行业术语、风格偏好，差异往往只在数十兆的增量上。

多 LoRA 共驻的动机正是消除这种重复：让所有任务共享同一份基础权重，只让各自的小增量并存。

## 二、核心原理

LoRA 把权重更新分解为低秩增量：基础权重 $W$ 冻结，任务只训练 $A_i B_i$。共驻服务因此可以：

1. 在显存中只保留一份基础模型 $W$。
2. 为每个任务/租户维护独立的 $(A_i, B_i, s_i)$。
3. 在同一批次内对序列打上适配器标识，前向时让对应增量参与计算。

这样新增一个任务的边际成本，从「一整份模型」降到「一对低秩矩阵 + 少量元数据」。配合量化基座（QLoRA）与分页 KV 缓存，可服务规模进一步放大。

## 三、形式化与数学基础

LoRA 对某线性层的改造为：

$$h = Wx + \frac{\alpha}{r} B A x, \quad B \in \mathbb{R}^{d \times r},\ A \in \mathbb{R}^{r \times k}$$

其中 $r \ll \min(d, k)$，$\alpha$ 为缩放超参，等效缩放 $s = \alpha / r$。多适配器时按请求路由选择 $(A_i, B_i)$：

$$h_i = Wx + s_i B_i A_i x$$

参数量对比：全微调需 $d \times k$ 个参数，LoRA 只需 $r(d+k)$，比率约为：

$$\frac{r(d+k)}{dk} \approx r\left(\frac{1}{k} + \frac{1}{d}\right)$$

当 $r=8,\ d=k=4096$ 时，该比率约 $0.4\%$，即每任务增量只有基座的千分之几。

## 四、代码实现

最小可用的多 LoRA 前向。

```python
import torch

class LoRALayer:
    def __init__(self, W, r, alpha):
        self.W = W                       # 冻结: [d, k]
        self.r = r
        self.scale = alpha / r
        self.adapters = {}               # aid -> (A, B)

    def register(self, aid, A, B):
        self.adapters[aid] = (A, B)      # A: [r, k], B: [d, r]

    def forward(self, x, aid):
        out = x @ self.W.T
        if aid is not None:
            A, B = self.adapters[aid]
            out = out + self.scale * (x @ A.T) @ B.T
        return out
```

批内混合时，按 adapter 分组调用该前向即可（见「批内异构 LoRA 调度」）。

## 五、与其他技术对比

| 方案 | 每任务额外显存 | 数量扩展 | 隔离性 | 切换成本 |
| --- | --- | --- | --- | --- |
| 全量微调多模型 | 一整份模型 | 差 | 物理隔离 | 高 |
| 多 LoRA 共驻 | $r(d+k)$ | 好 | 逻辑隔离 | 低 |
| Prompt/前缀微调 | 少量前缀 | 好 | 逻辑隔离 | 极低 |
| 多适配器（Adapter） | 小瓶颈层 | 好 | 逻辑隔离 | 低 |

Prompt 微调增量更小，但占用上下文长度、表达能力受限；LoRA 在表达力与成本间较均衡。

## 六、常见误区

- 误区一：LoRA 越多越慢。若批内同适配器或分组处理，开销接近同构；只有频繁异构切换才有成本。
- 误区二：多 LoRA 共驻等于物理隔离。它是逻辑隔离，需靠鉴权防止越权调用他人适配器。
- 误区三：共享基座会泄露数据。前向只结合请求绑定的增量，不加载他人数据；但要防止基座被恶意适配器「污染」通用行为。
- 误区四：所有任务都需要 LoRA。极简单或极少样本的任务，提示工程可能已足够。

## 七、与开源书·权威来源对应

- Hu, E. et al. (2021)《LoRA: Low-Rank Adaptation of Large Language Models》。
- Dettmers, T. et al. (2023)《QLoRA: Efficient Finetuning of Quantized LLMs》。
- huggingface/peft（参数高效微调库）。
- vllm-project/vllm（多 LoRA 推理服务支持）。

## 八、面试题

1. 多 LoRA 共驻为何省显存？答：基础权重与 KV 缓存共享，仅各适配器低秩增量额外驻留。
2. LoRA 增量参数量是多少？答：$r(d+k)$，相对全量 $dk$ 的比率约为 $r(1/k+1/d)$。
3. 逻辑隔离与物理隔离的区别？答：共享进程/基座但按请求路由增量，vs 独立进程/模型。
4. 何时不应使用多 LoRA 共驻？答：任务需要改基础行为、或合规要求强隔离时，应考虑独立部署。

## 九、演进与趋势

LoRA 交换入显存、按需加载已支持千级适配器共驻；适配器市场与按需计费正在成为平台能力。更细粒度的 token 级路由与混合专家式结构也在探索中，具体能力以各框架官方文档为准。

## 十、小结

多 LoRA 共驻把「一个模型服务多任务」的成本压到极低：基座共享、增量独立、批内路由。它是多租户微调服务的核心形态，理解 $h_i = Wx + s_i B_i A_i x$ 这一分解，就理解了它为何既省资源又能保持任务差异。
