# Token 级与步级 Span 标注

> 对应 vllm-project/vllm 步级指标与 karpathy/nanoGPT 训练步结构，及 LLM 推理性能剖析（profiling）实践。

## 一、背景与挑战

函数级/请求级 span 足以定位「哪一步慢」，但诊断 LLM 推理性能时远远不够：用户关心的往往是首 token 时延（TTFT）与每 token 时延（TPOT），而这些由 prefill（处理全部输入）与 decode（逐 token 生成）两阶段的不同特征决定。仅记录「generate 耗时 2s」无法区分是 prefill 慢（输入长/批处理竞争）还是 decode 慢（每步计算/调度开销）。要进一步做层级的算子瓶颈分析（注意力、MLP、通信），就需要更细粒度的步级/层級 span 标注。

挑战在于：细粒度打点开销巨大——每步、每层都写 span 会显著污染性能本身，必须在「可见性」与「开销」间取舍。

## 二、核心原理

步级标注在解码循环内逐迭代打 span，并在语义上区分两个阶段：

1. Prefill span：覆盖输入编码与 KV cache 构建，通常是一次较大的前向。
2. Decode step span：每个生成 token 一次前向，记录单步时延、采样耗时。
3. 层级 span（可选）：在 transformer 层内标注注意力/MLP/通信，用于算子级剖析。
4. 阶段聚合：从步级 span 聚合出 TTFT（首个 decode 前的耗时）与 TPOT（decode 步均值）。

务实做法是抽样标注：只对被采样请求做步级打点，既保留诊断能力又控制开销。

## 三、形式化与数学基础（含 LaTeX）

单步时延定义为该步起止之差：

$$
\ell_i=t_i^{\text{end}}-t_i^{\text{start}}
$$

TTFT 为 prefill 段结束到首个 decode 开始的间隔（含排队）：

$$
\text{TTFT}=t_{\text{first\_decode}}-t_{\text{request\_start}}
$$

TPOT 为 decode 步时延均值：

$$
\text{TPOT}=\frac{1}{N}\sum_{i=1}^{N}\ell_i
$$

若对第 $L$ 层记录算子耗时 $o_{i,l}$，则步时延可分解：

$$
\ell_i=\sum_{l=1}^{L} \big(\tau^{\text{attn}}_{i,l}+\tau^{\text{mlp}}_{i,l}+\tau^{\text{comm}}_{i,l}\big)
$$

用于定位层内算子瓶颈（如通信占比过高）。

## 四、代码实现

```python
# 解码循环逐 step 打 span（结构示意，抽样）
sampled = should_sample(request_id, rate=0.05)
for i in range(max_steps):
    if sampled:
        with tracer.start_span(f"decode_step_{i}") as sp:
            sp.set_attribute("step", i)
            out = model.step(input_ids)
    else:
        out = model.step(input_ids)
    if out.is_final:
        break
```

## 五、与其他技术对比

- 请求级 span：零开销但看不清 prefill/decode 拆分，无法解释 TTFT/TPOT。
- 步级 span：能定位逐 token 瓶颈，但全量开销大，通常抽样。
- 层級 span：最细、最贵，仅在专项剖析时开启，不适合常驻。

## 六、常见误区

- 「高频打点污染性能」：全量步级埋点使被测系统失真，应抽样。
- 「未区分 prefill 与 decode」：二者计算特征不同，混在一起会误导优化方向。
- 「用 wall-clock 代替队列分离」：TTFT 含排队，需单独记录以区分容量与计算问题。
- 「在 span 名写动态序号却无聚合」：需配合指标聚合才有意义。

## 七、与开源书·权威来源对应

- vllm-project/vllm：暴露 prefill/decode 步级指标与计时。
- karpathy/nanoGPT：展示训练 step 结构与计时方式。
- LLM 推理性能剖析（profiling）实践文献（以官方最新文档为准）。

## 八、面试题

- 如何低成本获得 token 级时延分布？为何要抽样而非全量？
- TTFT 与 TPOT 分别由哪些 span 决定？如何区分容量与计算问题？
- 步级标注开销如何控制？

## 九、演进与趋势

硬件计数器（GPU kernel、NVLink 带宽）与 span 关联，使步级标注下沉到算子级；与自适应采样结合——异常请求自动升采样，常态低开销；标准化 decode/prefill span 语义让跨引擎对比成为可能。

## 十、小结

Token 级与步级 span 标注把推理性能拆到 prefill/decode 与单步、乃至层級算子，是根因分析的关键。其权威实践来自 vLLM 与 nanoGPT，落地须以抽样控制开销、并明确区分 prefill 与 decode 以正确解读 TTFT/TPOT。
