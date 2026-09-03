# FactScore与事实分解

> 对应 Min et al. 2023 "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation"。

## 一、背景与挑战

长文本生成（如传记）含大量事实，整体判对错太粗。FactScore 把生成拆为原子事实，逐条验真，给"事实精度"分数。

## 二、核心原理

用模型把文本分解为原子事实，对每条用检索/知识源判支持与否。指标为被支持事实比例，并按主题分组分析。

## 三、数学形式

事实精度：

$$
\mathrm{FActScore}=\frac{|\{f_i: \mathrm{supported}(f_i)\}|}{|\mathcal{F}|}
$$

宏平均：

$$
\bar{S}=\frac{1}{T}\sum_{t}S_t
$$

## 四、代码实现

```python
def fact_score(facts, supported):
    return sum(1 for s in supported if s)/len(facts)

print(fact_score(range(10), [1,1,0,1,1,0,1,1,1,0]))
```

## 五、与其他对比

相比 TruthfulQA（整体），FactScore 细到原子事实；相比 FEVER（句子级），它处理长生成。

## 六、常见误区

误区一：分解模型无误（分解本身可错）。误区二：检索源完备假设。误区三：忽略"无法验证"类事实。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：FactScore 思路？答：拆原子事实逐条验真得精度。
- Q：局限？答：依赖分解与检索质量，存在验证盲点。

## 九、演进

从整体判分到原子事实评估，长文本事实性评测走向细粒度。

## 十、小结

FactScore 以原子事实分解实现长生成的事实精度量化，是细粒度幻觉评测代表。
