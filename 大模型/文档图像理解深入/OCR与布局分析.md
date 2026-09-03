# OCR与布局分析

> 对应文本检测/识别（DBNet/CRNN 等）；版面分析（LayoutLM 前置）。

## 一、背景与挑战

文档图像文字密集、版式复杂（多栏、嵌套表格），检测与识别需兼顾精度与结构还原。

## 二、核心原理

两步：文本检测（定位行/字框，常用基于分割如 DBNet）与识别（CRNN/Transformer 解码字符）；布局分析进一步把区域分类为标题/段落/表格/图，并给出阅读顺序。

## 三、数学形式

检测常用二值图监督：

$$\mathcal L = \mathcal L_{bce}(P, G) + \lambda\mathcal L_{dice}(P, G)$$

$P$ 为概率图，$G$ 为真值。

## 四、代码实现

```python
boxes = det_model(image)         # 文本框
texts = [rec_model(crop(image, b)) for b in boxes]
```

## 五、与其他对比

- 与 文档图像总览 衔接为前置。
- 与 表格理解 共享结构还原。

## 六、常见误区

- 检测框重叠/断裂致识别串字。
- 忽略阅读顺序，抽取字段错位。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 为何需布局分析？答：还原区域类型与阅读顺序，才能正确组织抽取结果。

## 九、演进

规则 OCR → 检测+识别 → 端到端 + 布局。

## 十、小结

OCR 与布局是文档理解的地基，框质量直接决定上层任务上限。
