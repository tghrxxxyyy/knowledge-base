# 任务配置 YAML 与 few-shot 模板

> 对应 Gao 2021 lm-evaluation-harness (EleutherAI)。

## 一、背景与挑战
评测的提示格式显著影响分数，需把模板与文档作为数据而非代码管理。

## 二、核心原理
任务用 YAML 声明 dataset、num_fewshot、template，运行时渲染为模型输入。

## 三、形式化与数学基础
few-shot 提示构造为拼接：
$ x = q + \sum_{j=1}^{k}(d_j \oplus a_j) \oplus q_{test} $

## 四、代码实现
```python
def build_prompt(docs, k, q):
    # 拼接 k 个示范与测试问题
    parts = [f'{d["q"]} {d["a"]}' for d in docs[:k]]
    parts.append(q)
    return '\n'.join(parts)
```

## 五、与其他技术对比
YAML 配置比硬编码更易评审与共享，降低提示泄露风险。

## 六、常见误区
未冻结模板导致跨版本分数不可比；上下文过长截断示范。

## 七、与开源书/权威来源对应
Gao 2021 的 harness 以 YAML 描述任务与模板。

## 八、面试题
为何 few-shot 数量要写进配置并版本化？

## 九、演进与趋势
模板库与提示审计成为评测合规要求。

## 十、小结
配置即评测契约，模板版本应与分数一同归档。
