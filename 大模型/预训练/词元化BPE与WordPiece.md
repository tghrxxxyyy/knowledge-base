# 词元化：BPE 与 WordPiece

> 对应 llm-course 与 d2l-zh「自然语言处理：预训练」。Tokenization 是大模型输入管线的第一步，直接影响词汇表与压缩率。

## 一、核心概念

模型无法直接处理文本，需映射到离散 token id。主流子词算法：

- **BPE(Byte-Pair Encoding)**：从字符出发，反复合并最高频的相邻对，构建子词词表。GPT-2/LLaMA 采用。
- **WordPiece**：类似 BPE，但合并依据「似然增益」而非频率。BERT 采用。
- **Unigram**：基于语言模型概率删除低损子词。SentencePiece 常用。
- **SentencePiece**：将空格视为普通字符(`▁`)，支持多语言、无需预分词。

## 二、数学形式（BPE 合并准则）

对相邻符号对 `(a,b)`，合并增益按共现频次排序，迭代合并直至达到词表大小 `V`：

```
pair* = argmax_{(a,b)} count(a,b)
vocab ← vocab ∪ {ab}
```

## 三、代码实现

```python
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-hf")
ids = tok("大模型让 NLP 更简单", add_special_tokens=False)
print(ids, tok.convert_ids_to_tokens(ids))
```

## 四、关键要点

| 算法 | 代表 | 合并依据 |
|------|------|----------|
| BPE | GPT/LLaMA | 频率 |
| WordPiece | BERT | 似然增益 |
| Unigram | mT5 | 概率 |
| SentencePiece | 多语言 | 任意 |

## 五、常见误区

- 不同 tokenizer 的 token 数不可直接比较「字数」（中文压缩率差异大）。
- 推理时未用与训练一致的 tokenizer 导致分布偏移。

## 六、与开源书的对应

- llm-course「Tokenizers」：https://github.com/mlabonne/llm-course#llm-fundamentals
- d2l-zh「自然语言处理：预训练」：https://zh.d2l.ai/chapter_pretraining/index.html
- Sennrich et al., *Neural Machine Translation of Rare Words with Subword Units* (BPE), 2016.

## 七、面试题

- BPE 与 WordPiece 的合并准则有何不同？
- 为何中文场景下 token 数通常远多于英文单词数？
