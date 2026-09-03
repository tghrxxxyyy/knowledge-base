# MT-Bench与多轮评测

> 对应 Zheng et al. 2023 "MT-Bench: A Benchmark for Multi-turn Conversation" 与 Chatbot Arena。

## 一、背景与挑战

单轮评测无法捕捉多轮遵循、上下文记忆与指代消解。MT-Bench 用 80 道两轮题，由 GPT-4 裁判打分（1-10），测对话能力。

## 二、核心原理

每题两轮，第二轮依赖第一轮；裁判按多维度（相关、正确、深度等）打分。结合 Chatbot Arena 的众包 pairwise 形成自动 + 人类双轨。

## 三、数学形式

两轮平均：

$$
S=\frac{1}{2}(s_1+s_2)
$$

Arena 胜率 Elo：

$$
E_A=\frac{1}{1+10^{(R_B-R_A)/400}}
$$

## 四、代码实现

```python
def mt_score(s1, s2):
    return (s1 + s2) / 2

def elo_expected(ra, rb):
    return 1/(1+10**((rb-ra)/400))

print(mt_score(8,7), round(elo_expected(1200,1200),3))
```

## 五、与其他对比

相比 AlpacaEval（单轮），MT-Bench 多轮；相比静态基准，Arena 更贴近真实偏好。

## 六、常见误区

误区一：MT-Bench 分高即通用对话强（仅 80 题）。误区二：忽略第二轮依赖。误区三：裁判模型自身偏见未校正。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：MT-Bench 测什么单轮测不到？答：多轮上下文遵循与指代一致性。
- Q：为何结合 Arena？答：自动裁判 + 人类众包交叉验证偏好。

## 九、演进

从单轮到多轮、从自动到人类竞技场，对话评测走向混合验证。

## 十、小结

MT-Bench 以两轮结构与 GPT-4 裁判补多轮评测空白，是对话能力核心基准。
