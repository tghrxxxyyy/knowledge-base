# Token 级与步级 Span 标注

> 对应 vllm-project/vllm 与 karpathy/nanoGPT。

## 一、背景与挑战
仅函数级 span 不足以诊断首 token 时延与每步开销，需要更细粒度。

## 二、核心原理
在解码循环每步打 span，并记录 prefill 与 decode 阶段、每层耗时。

## 三、形式化与数学基础
每步时延：
$ \ell_i = t_{i}^{end} - t_{i}^{start} $

## 四、代码实现
```python
for i in range(steps):
    with span(f'step_{i}'):
        out = model.step(input_ids)
```

## 五、与其他技术对比
步级更细但开销大，通常抽样标注而非全量。

## 六、常见误区
高频打点污染性能；未区分 prefill 与 decode。

## 七、与开源书/权威来源对应
vllm-project/vllm 暴露步级指标；karpathy/nanoGPT 展示训练步结构。

## 八、面试题
如何低成本获得 token 级时延分布？

## 九、演进与趋势
硬件计数器与 span 关联。

## 十、小结
细粒度标注是性能根因分析的关键。
