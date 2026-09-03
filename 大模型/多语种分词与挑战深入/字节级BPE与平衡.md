# 字节级BPE与平衡

> 对应 Radford et al., *GPT-2* 字节级 BPE, 2019；Xue et al., *ByT5*, 2022（纯字节 Transformer）。

## 一、背景与挑战

子词级多语仍有不公平与 UNK 风险；字节级从 UTF-8 字节出发更通用。

## 二、核心原理

以 256 字节为初始符号训练 BPE，任何文本可编码；ByT5 直接用字节序列，省分词器但序列更长、需更强模型吸收。

## 三、数学形式

初始符号集 $|\Sigma|=256$；序列长度 $T_{byte}\gg T_{subword}$；模型须补偿长距离依赖。

## 四、代码实现

```python
import regex as re
ids = [b for b in text.encode("utf-8")]   # 字节级
```

## 五、与其他对比

- 字节级避免 UNK 与不公平，但算力增。
- 与 分词器训练与词表构建深入（子词 vs 字节）对照。

## 六、常见误区

- 字节级序列过长致注意力成本飙升。
- 误以为免分词即免训练（仍需 tokenizer 配置）。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 字节级 BPE 优劣？答：绝对无 UNK、跨语公平，但序列长、算力高。

## 九、演进

子词 → 字节级 BPE → 纯字节模型（ByT5）。

## 十、小结

字节级以公平换长度，是大模型多语常用折中。
