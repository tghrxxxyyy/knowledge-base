# Lost-in-the-Middle现象

> 对应 Liu et al. 2023 "Lost in the Middle: How Language Models Use Long Contexts"。

## 一、背景与挑战

实验发现模型对长文档首尾信息利用好，中间信息易被忽略。这对 RAG（检索片段多时）与长提示设计有直接后果。

## 二、核心原理

在长上下文不同位置放关键证据，测 QA 准确率。结果呈 U 型：首尾高、中间低。说明注意力在长程中段的聚合较弱。

## 三、数学形式

位置准确率 U 型：

$$
A(p)=a\cdot p^2 + b\cdot p + c,\quad \text{minimum at } p\approx 0.5
$$

相对衰减：

$$
\delta=A(0.5)/A(\mathrm{edge})
$$

## 四、代码实现

```python
def u_curve(p):
    return 4*(p-0.5)**2 + 0.3  # 中间最低

for p in [0.0,0.25,0.5,0.75,1.0]:
    print(p, round(u_curve(p),3))
```

## 五、与其他对比

相比 Needle 全位置均匀，本文系统刻画 U 型；对 RAG 设计（证据放首尾）有指导意义。

## 六、常见误区

误区一：长上下文即均匀利用。误区二：忽略提示中证据位置。误区三：以为更大模型无此现象（仍存在）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Q：Lost-in-the-Middle 含义？答：长上下文中段信息利用率低，呈 U 型。
- Q：对 RAG 启示？答：重要证据宜置首尾或重排。

## 九、演进

该发现推动长上下文训练（位置插值、注意力改进）与提示工程（证据重排）。

## 十、小结

Lost-in-the-Middle 揭示长上下文的中段失效，是长文本评测与应用的硬约束。
