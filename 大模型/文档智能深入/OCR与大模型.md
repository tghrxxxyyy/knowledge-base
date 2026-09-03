# OCR 与大模型

> 见「文档智能深入/文档智能总览」；OCR 在现代管线中的角色。

## 一、背景与挑战

扫描/拍照文档需先转文本，但纯OCR易错且丢结构。

## 二、核心原理

传统 OCR（检测+识别，如 PaddleOCR/EasyOCR）输出文字与坐标；多模态大模型可免显式 OCR 直接读图理解（如 GPT-4V/Qwen-VL）。实务常 OCR+VLM 互补：OCR 给精确文字，VLM 给语义。

## 三、关键要点

- 手写/艺术字 OCR 弱，VLM 补。
- 坐标对版面分析关键。

## 四、代码实现

```python
texts, boxes = ocr(image)        # 传统
sem = vlm(image, "理解文档内容")  # 语义
```

## 五、与其他对比

- OCR 精确但无语义；VLM 语义但可能错字。

## 六、常见误区

- VLM 完全取代 OCR——精细字段仍需 OCR。

## 七、与开源书对应

- llm-course: https://github.com/mlabonne/llm-course
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为何 OCR 与 VLM 常互补？

## 九、演进

传统OCR → 检测识别分离 → OCR+VLM。

## 十、小结

OCR，是文档的「识字器」。
