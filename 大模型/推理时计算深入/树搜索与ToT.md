# 树搜索与思维树（ToT）

> 对应 Yao et al., *Tree of Thoughts*, 2023；搜索式推理。

## 一、背景与挑战

线性 CoT 无回溯；复杂问题需探索与剪枝多分支。

## 二、核心原理

把推理拆为树节点（thought），用模型评估各节点前景并搜索（BFS/DFS/beam），保留有希望分支、剪掉差支。

## 三、数学形式

状态值 $V(s)=\text{LLM}(s)$ 评估；搜索选 $\max_{path}\sum_t V(s_t)$ 或 beam 保留 top-b。

## 四、代码实现

```python
for depth in range(D):
    children = expand(node)
    node = beam_select(children, k=b)
```

## 五、与其他对比

- 与 智能体规划（搜索）共享。
- 与 世界模型（内部模拟）对照。

## 六、常见误区

- 节点评估噪声大导致错误剪枝。
- 搜索宽度/深度误设致成本失控。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- ToT 相对 CoT 优势？答：可分支、评估、回溯，避免线性错误累积，适合难搜索问题。

## 九、演进

CoT→Self-Consistency→ToT→图搜索。

## 十、小结

树搜索把推理变成可探索过程，强于复杂组合问题。
