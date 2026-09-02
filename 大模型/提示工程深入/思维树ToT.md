# 思维树 Tree-of-Thought

> 对应 Yao et al., *Tree of Thoughts*, 2023。

## 一、核心概念

ToT 把推理组织成**树**：每个节点是一个「思考步骤」，模型可生成多分支、对节点自评(搜索)、回溯，最终选最优路径。适合需探索/规划的难题(24点游戏、走迷宫)。

```
每步生成多个候选 thought → 评估 → 保留优者 → 继续/回溯
```

结合 BFS/DFS 搜索与价值评估，比线性 CoT 更强但成本高。

## 二、关键要点

| 维度 | CoT | ToT |
|------|-----|-----|
| 结构 | 链 | 树 |
| 搜索 | 无 | BFS/DFS |
| 适用 | 线性推理 | 探索规划 |

## 三、与开源书的对应

- Yao et al., *Tree of Thoughts*, 2023.
- Prompt-Engineering-Guide: https://www.promptingguide.ai/zh/techniques/tot

## 七、面试题

- ToT 相比 CoT 解决了什么？
