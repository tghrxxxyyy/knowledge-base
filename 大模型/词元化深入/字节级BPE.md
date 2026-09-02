# 字节级 BPE

> GPT-2 引入，彻底消除 OOV。

## 一、背景与挑战

传统 BPE 在罕见字符/新语言上仍有 OOV。字节级 BPE 直接在 UTF-8 字节(256 基础符号)上做 BPE，理论上可表示任意文本，词表稳定。

## 二、核心原理

先转字节序列，再做 BPE 合并，得到「字节级子词」。GPT-2/3 用此法，配合 added_tokens 处理特殊符号。

## 三、关键要点

- 词表固定 256 起，合并后“虚拟字符”有限。
- 中文等仍会被拆为多字节 token。

## 四、代码实现

```python
enc = tiktoken.get_encoding("gpt2")   # 字节级 BPE
print(enc.encode("Hello 世界"))
```

## 五、常见误区

- 字节级不等于“一个汉字一个 token”，仍需多 token。

## 六、与开源书对应

- Radford et al., *GPT-2/Language Models are Unsupervised Multitask Learners*, 2019.

## 七、面试题

- 字节级 BPE 如何保证无 OOV？

## 八、演进

GPT-2 字节级 → GPT-4 改进 cl100k 词表(含合并常见汉字组)。

## 九、小结

字节级 BPE 以稳定词表换取零 OOV，是现代大模型主流选择。
