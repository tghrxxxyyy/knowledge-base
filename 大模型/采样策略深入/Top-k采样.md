# Top-k 采样

> 对应 Fan et al., *Hierarchical Neural Story Generation*, 2018。

## 一、背景与挑战

固定 k 个最高概率词采样，简单有效但 k 难自适应分布形状。

## 二、核心原理

每步取概率前 k 的词，重归一后采样；k 控制候选池大小与多样-质量权衡。

## 三、数学形式

$V^{(k)}=\text{topk}(P(\cdot|h),k)$，再 $y\sim \text{softmax}(z_{V^{(k)}})$。

## 四、代码实现

```python
gen = model.generate(input_ids, do_sample=True, top_k=40, temperature=0.7)
```

## 五、与其他对比

- 与 核采样深入 比：k 固定、不随分布胖瘦调。
- 与 温度与解码深入 常并用。

## 六、常见误区

- 尖峰分布下 k 过大引入噪声；平尾下 k 过小失多样。
- 固定 k 跨任务不鲁棒。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- top-k 局限？答：固定 k 不随分布形状自适应，胖尾漏、尖峰噪。

## 九、演进

top-k → top-p → 二者组合。

## 十、小结

top-k 简单但僵化，现代多被核采样补充。
