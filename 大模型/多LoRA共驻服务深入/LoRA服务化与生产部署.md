# LoRA服务化与生产部署

> 对应 Hu et al. 2021「LoRA」、Ouyang et al. 2022「InstructGPT」与 huggingface/peft。

## 一、背景与挑战

把多 LoRA 能力暴露为对外 API，远不止「跑通推理」。生产环境需要处理：租户鉴权与隔离、适配器路由、限流与配额、计费、版本管理、灰度发布与回滚。任何一个缺失都可能酿成事故——最典型的是租户 A 越权调用了租户 B 的适配器，导致数据或品牌串台。

因此，MoLA 服务化本质是把「技术能力」转化为「可运营的资源」。

## 二、核心原理

典型分层架构：

1. **网关层**：校验 API key → 解析出 tenant 与可访问的 adapter 集合；做全局限流与鉴权。
2. **路由/调度层**：把请求绑定到具体 `adapter_id`，检查配额，决定批调度策略。
3. **推理层**：按需加载权重（分层缓存），执行批内异构 LoRA 计算。
4. **计量层**：按适配器维度记录调用量/token 数，供计费与配额扣减。
5. **治理层**：适配器注册、版本、灰度、回滚与审计日志。

请求元组可视为 $r = (tenant,\ adapter\_id,\ x)$，其中 $x$ 是输入内容。

## 三、形式化与数学基础

鉴权与配额可建模为一个判定：请求被允许当且仅当

$$allow = \big(adapter\_id \in granted(tenant)\big) \land quota\_ok(tenant)$$

其中 $granted(tenant)$ 是该租户被授权的适配器集合，$quota\_ok$ 检查剩余配额。计费可表达为对适配器维度的加权求和：

$$Cost = \sum_{a} w_a \cdot tokens_a$$

$w_a$ 是适配器级单价（可因模型规模、基座版本而异）。配额约束为：

$$\sum_{a} w_a \cdot tokens_a \le Budget(tenant)$$

## 四、代码实现

网关 + 服务层的鉴权与路由骨架。

```python
from collections import defaultdict

tenant_grants = defaultdict(set)      # tenant -> {adapter_id, ...}
usage = defaultdict(float)            # tenant -> 已用量
budget = defaultdict(lambda: 1e9)     # tenant -> 配额

def handle(req, cache, model):
    # 1. 鉴权：适配器必须属于该租户
    if req.adapter not in tenant_grants[req.tenant]:
        raise PermissionError("adapter not granted to tenant")
    # 2. 配额检查
    if usage[req.tenant] >= budget[req.tenant]:
        raise RuntimeError("quota exceeded")
    # 3. 加载权重并推理
    adapter = cache.ensure(req.adapter)
    out = model.generate(req.x, adapter)
    # 4. 计量
    usage[req.tenant] += price(req.adapter, out.tokens)
    return out
```

要点：鉴权必须在「加载权重之前」完成，避免越权请求触发不必要的换入；计量需与幂等键配合，防止重试重复计费。

## 五、与其他技术对比

| 部署形态 | 资源效率 | 隔离强度 | 运维复杂度 | 适用规模 |
| --- | --- | --- | --- | --- |
| 每租户独立模型服务 | 低 | 物理隔离 | 高 | 少量大客户 |
| 多 LoRA 共驻共享基座 | 高 | 逻辑隔离 | 中 | 大量中小租户 |
| 独立进程 + 共享权重 | 中 | 进程隔离 | 中 | 合规要求高 |
| 无服务化（离线批跑） | —— | —— | 低 | 非实时场景 |

## 六、常见误区

- 误区一：`adapter_id` 公开即安全。必须做租户级授权，防止越权调用他人适配器。
- 误区二：只在网关鉴权。服务层也要复核，防止绕过网关的内部调用。
- 误区三：计费按请求数。应结合 token 数与适配器单价，否则大请求补贴小请求。
- 误区四：重试会重复计费。需用幂等键把重试归并到同一业务操作。
- 误区五：无需版本管理。适配器迭代必须有版本与回滚，否则一次坏更新影响全部租户。

## 七、与开源书·权威来源对应

- Hu, E. et al. (2021)《LoRA》。
- Ouyang, L. et al. (2022)《Training Language Models to Follow Instructions (InstructGPT)》，讨论服务化与对齐实践。
- huggingface/peft 的适配器管理接口。
- vllm-project/vllm 的多 LoRA 服务能力。

## 八、面试题

1. 如何隔离租户适配器并计费？答：网关鉴权绑定 `adapter_id`，服务层复核，按调用量/适配器单价计量。
2. 为什么鉴权要早于权重加载？答：避免越权请求触发显存换入，浪费资源且可能泄露元信息。
3. 适配器灰度发布怎么做？答：按租户/流量比例路由到新旧版本，保留快速回滚。
4. 如何防止重试重复计费？答：用 `Idempotency-Key` 归并同一业务操作。

## 九、演进与趋势

适配器市场与按需计费正在成为平台能力；统一基座 + 路由即「模型即服务」的多租户标准形态。审计、合规与适配器供应链安全（防止恶意适配器）日益重要，具体机制以各平台官方文档为准。

## 十、小结

LoRA 服务化把微调能力变成可计量、可隔离、可治理的 API 资源。技术要点是分层架构 + 鉴权前置 + 适配器维度计量；工程要点是版本、灰度、回滚与幂等计费。二者缺一，能力都无法真正对外交付。
