# GAIA与真实任务

> 对应 Mialon et al. 2023 "GAIA: A Benchmark for General AI Assistants"。

## 一、背景与挑战

GAIA 用需多模态、多工具、多步的真实任务（如"找出某图地点并算距离"）。挑战是任务开放、验证难、且需真实世界知识。

## 二、核心原理

每任务含问题、附件与可验证答案（常精确匹配或程序验证）。评测用准确率，并分析所需能力组合（推理/检索/多模态/工具）。

## 三、数学形式

任务准确率：

$$
\mathrm{Acc}=\frac{1}{N}\sum\mathbf{1}[\mathrm{verify}(y)=1]
$$

能力覆盖：

$$
C=\frac{|\mathrm{skills\ used}|}{|\mathrm{skills\ total}|}
$$

## 四、代码实现

```python
def gaia_acc(verified):
    return sum(verified)/len(verified)

print(round(gaia_acc([1,1,0,0,1]),3))
```

## 五、与其他对比

相比 AgentBench（合成环境），GAIA 更真实开放；相比 WebArena，它多模态且任务自然。

## 六、常见误区

误区一：低分即能力差（任务极难）。误区二：忽略多模态需求。误区三：用宽松匹配虚高。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：GAIA 特点？答：真实、多模态、多工具、可验证的自然任务。
- Q：为何难？答：需组合推理/检索/视觉/工具多种能力。

## 九、演进

GAIA 把代理评测拉向真实助手场景，成为通用代理能力的试金石。

## 十、小结

GAIA 以真实多能力任务逼近通用助手评测，是代理度量的高阶基准。
