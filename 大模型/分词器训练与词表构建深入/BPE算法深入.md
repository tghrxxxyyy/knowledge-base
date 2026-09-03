# BPE算法深入

> 对应 Sennrich et al., *Neural Machine Translation of Rare Words with Subword Units*, 2016；Radford et al., *GPT-2* 字节级 BPE, 2019。

## 一、背景与挑战

固定词表无法覆盖开放词表与稀有词；BPE 以子词解决未登录词。

## 二、核心原理

从字符开始，反复合并语料中频度最高的相邻符号对，直至达到词表大小。GPT-2 用字节级 BPE，以 UTF-8 字节为初始符号避免 UNK。

## 三、数学形式

合并收益正比于 $\text{freq}(a,b)$；每次合并减少总 token 数 $\Delta = \text{freq}(a,b)$（替代单独计数）。

## 四、代码实现

```python
def merge_pair(pair, vocab):
    a, b = pair
    return {k.replace(a + b, chr(0)): v for k, v in vocab.items()}
```

## 五、与其他对比

- 比 WordPiece 合并准则不同（频度 vs 似然增益）。
- 与 Unigram（见 WordPiece与Unigram）概率化相反。

## 六、常见误区

- 初始符号选词而非字节，遇新字符出 UNK（GPT-2 字节级规避）。
- 词表过大致 embedding 膨胀。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 字节级 BPE 好处？答：以字节为基，理论上无 UNK，对任意文本可编码。

## 九、演进

BPE → 字节级 BPE → 与 Unigram 混合探索。

## 十、小结

BPE 以频度合并构建子词表，字节级消除 UNK。
