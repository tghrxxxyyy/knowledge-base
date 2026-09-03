# ROME 定位即编辑（因果中介分析）

> 对应 Meng et al., *Locating and Editing Factual Associations in GPT*, 2022。

## 一、背景与挑战

事实存于何处？ROME 用因果干预找关键 MLP 层，将编辑建模为线性关联写入。

## 二、核心原理

先靠因果中介分析定位“事实神经元”（某 MLP 层），把该层输出对 (subject→attribute) 的记忆视为线性映射 $W$，用新键值对解最小二乘更新。

## 三、数学形式

目标：解 $\hat W$ 使 $\hat W k_* = v_*$，约束 $\|R(\hat W-W)\|_2^2\le \epsilon$（局部性），闭式 $\hat W = W + \Delta$。

## 四、代码实现

```python
from easyeditor import ROME
editor = ROME(model, hparams)
editor.edit(prompts=["Steve Jobs is"], target="Apple co-founder")
```

## 五、与其他对比

- 一次性（one-shot）编辑，适合单事实。
- 与 MEND（多编辑外推）对照。

## 六、常见误区

- 把 subject 表示为单层键值过简，复杂关系易失败。
- 忽略局部性约束致副作用。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：ROME 为何用闭式解？答：把编辑建模为线性层最小二乘约束，可解析更新且保局部性。

## 九、演进

定位分析 → ROME → MEMIT（批量多编辑）。

## 十、小结

ROME 借因果定位+线性写入实现精准单事实编辑，奠基后续方法。
