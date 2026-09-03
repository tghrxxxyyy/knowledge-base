# MEND 超网络编辑

> 对应 Mitchell et al., *Fast Model Editing at Scale*, 2022。

## 一、背景与挑战

ROME 一次改一处；MEND 要支持多编辑且外推到更多编辑。

## 二、核心原理

把权重梯度映射为低秩更新，训练一个超网络（hypernetwork）把“编辑梯度”转换为有效参数 delta，能泛化到未见的批量编辑。

## 三、数学形式

更新 $\Delta W = H_\phi(\nabla_W \mathcal L_{edit})$；$\phi$ 在模拟编辑上训练，使多编辑叠加仍稳。

## 四、代码实现

```python
from easyeditor import MEND
editor = MEND(model, hparams)
editor.edit(prompts=["A is"], target=["B"]*N)   # 多编辑
```

## 五、与其他对比

- 比 ROME 支持批量编辑外推。
- 与 SERAC（存编辑缓存）路线不同。

## 六、常见误区

- 训练超网络需足量模拟编辑，否则泛化差。
- 编辑间冲突未被显式处理。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：MEND 相对 ROME 优势？答：用超网络把梯度映为更新，支持多编辑并外推。

## 九、演进

ROME → MEND → MEMIT（大规模批量）。

## 十、小结

MEND 以超网络实现可扩展多编辑，适合频繁更新场景。
