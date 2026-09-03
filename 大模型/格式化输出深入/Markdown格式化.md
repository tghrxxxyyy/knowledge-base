# Markdown 格式化

> 对应提示中的 Markdown 约定；与 提示工程深入 衔接。

## 一、背景与挑战

需标题层级、列表、代码块、引用等规范呈现，模型常不一致。

## 二、核心原理

在系统提示明确 Markdown 规范并给 few-shot 样例；必要时用约束解码限制标题/列表语法。

## 三、数学形式

结构树 $T$（标题/段落/列表）；合法输出 $y$ 解析为合规 $T$。

## 四、代码实现

```python
sys = "严格用 Markdown：H2 起节、要点用 -、代码用反引号包裹。"
out = llm(system=sys, user=prompt)
```

## 五、与其他对比

- 与 表格与列表输出深入 细分。
- 与 结构化输出深入 可并用（Markdown 内嵌 JSON）。

## 六、常见误区

- 代码块未闭合致渲染坏。
- 标题层级跳跃。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 如何稳定 Markdown 输出？答：明确规范+few-shot，必要时约束语法。

## 九、演进

提示 → 样例 → 解析校验。

## 十、小结

Markdown 格式化靠规范与样例，必要时语法约束。
