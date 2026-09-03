# 精确子串与n-gram匹配

> 对应 Lee et al., 2022（13-gram 重叠去重）；Penedo et al., *RefinedWeb*, 2023（精确/模糊子串过滤）。

## 一、背景与挑战

近似去重需判定两个长文档是否共享大段重复文本，直接全文档比较代价高。

## 二、核心原理

把文档切成连续 $n$-gram（如 13 词/50 字符），用哈希集合表示文档指纹；两文档共享指纹比例高即重复。可加归一化（去大小写、标点、空白）提升召回。

## 三、数学形式

重叠分数 $o(D_1,D_2)=\frac{|F(D_1)\cap F(D_2)|}{\min(|F(D_1)|,|F(D_2)|)}$，其中 $F(D)$ 为文档 $n$-gram 指纹集合。

## 四、代码实现

```python
def fingerprints(doc, n=13):
    toks = doc.lower().split()
    return {tuple(toks[i:i+n]) for i in range(len(toks)-n+1)}

def overlap(a, b):
    fa, fb = fingerprints(a), fingerprints(b)
    return len(fa & fb) / min(len(fa), len(fb))
```

## 五、与其他对比

- 与 MinHash（见 后缀数组与MinHash）互补：$n$-gram 重叠更精确、MinHash 更快近似。
- 与 数据质量过滤与困惑度过滤深入（规则过滤）前后衔接。

## 六、常见误区

- $n$ 太小致误判（短公共短语），太大漏删较长片段复制。
- 未按语言切词，中文未分词使 $n$-gram 失真。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何用 13-gram？答：经验上能捕捉跨文档复制段落，又不至于过碎。

## 九、演进

全文档哈希 → 后缀/子串 → n-gram 重叠 → 加权重叠。

## 十、小结

n-gram 重叠是近似去重主力，需配合语言切词与阈值调优。
