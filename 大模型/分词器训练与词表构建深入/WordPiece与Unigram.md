# WordPiece与Unigram

> 对应 Schuster & Nakajima, *WordPiece*, 2012（BERT）；Kudo, *WordPiece/Unigram*, 2018（Unigram LM）。

## 一、背景与挑战

BPE 纯频度合并未必最优；Unigram 提供概率化、可剪枝的词表。

## 二、核心原理

WordPiece 按合并后似然增益 $\frac{\text{freq}(ab)}{\text{freq}(a)\text{freq}(b)}$ 选最优对。Unigram 假设词表为隐变量，用 EM 训练每子词概率，按损失增量剪枝到目标大小。

## 三、数学形式

WordPiece 得分 $s(a,b)=\frac{\text{count}(ab)}{\text{count}(a)\text{count}(b)}$；Unigram 序列概率 $\prod_i p(w_i)$ 取 Viterbi 最优切分。

## 四、代码实现

```python
# Unigram 由 sentencepiece model_type=unigram 训练
SentencePieceTrainer.train(input="c", vocab_size=32000,
                            model_type="unigram")
```

## 五、与其他对比

- Unigram 可计算子词概率，便于剪枝与采样。
- 与 BPE算法深入（频度合并）准则不同。

## 六、常见误区

- 误以为 WordPiece 与 BPE 等同；合并准则不同。
- Unigram 剪枝致训练不稳定需热身。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Unigram 与 BPE 区别？答：Unigram 概率化可剪枝，BPE 贪心合并。

## 九、演进

WordPiece → Unigram → SentencePiece 统一。

## 十、小结

WordPiece 看似然增益，Unigram 概率化更灵活。
