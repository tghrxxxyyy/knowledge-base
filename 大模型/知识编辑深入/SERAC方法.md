# SERAC 检索式编辑

> 对应 Mitchell et al., *Memory-Based Model Editing at Scale*, 2022。

## 一、背景与挑战

改参数易冲突/遗忘；能否不改权重、用“编辑记忆”覆盖行为？

## 二、核心原理

SERAC 冻结原模型，外挂一个编辑案例库与一个范围分类器；新输入若匹配某编辑则交给小模型（用编辑上下文）回答，否则走原模型。

## 三、数学形式

判定：$c(x)=\arg\max_k \text{sim}(x, e_k)$；若匹配则 $y=\pi_{edit}(x, e_k)$，否则 $y=f_{base}(x)$。

## 四、代码实现

```python
from easyeditor import SERAC
editor = SERAC(model, hparams)
editor.edit(prompts=["The CEO is"], target=["New Name"])
```

## 五、与其他对比

- 完全不改权重，零灾难遗忘。
- 与 ROME（改权重）对照，SERAC 更稳但需检索。

## 六、常见误区

- 编辑库膨胀致检索慢、冲突。
- 分类器误判致走错分支。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：SERAC 为何无遗忘？答：原权重冻结，编辑走外挂分支，不扰动原知识。

## 九、演进

参数编辑 → 记忆编辑 → 混合（检索+写入）。

## 十、小结

SERAC 以记忆检索实现无损编辑，适合高频小更新。
