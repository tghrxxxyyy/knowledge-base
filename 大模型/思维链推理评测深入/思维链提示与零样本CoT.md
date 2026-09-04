# 思维链提示与零样本CoT

> 对应 Wei 2022 chain-of-thought prompting 与 Brown 2020 in-context learning。

## 一、背景与挑战
大模型在复杂推理上直接给答案准确率低，需要诱导其显式展开中间步骤。

## 二、核心原理
few-shot CoT 在示范中给出推理链；零样本 CoT 仅加一句 Let us think step by step 触发链式生成。

## 三、形式化与数学基础
把答案生成分解为步骤条件概率：
$ P(y|x) = \prod_{t=1}^{T} P(z_t | x, z_{<t}) P(y | x, z) $

## 四、代码实现
```python
def cot_generate(model, q):
    # 零样本 CoT 触发
    prompt = q + '\nLet us think step by step.'
    return model.generate(prompt, max_new_tokens=512)
```

## 五、与其他技术对比
相比直接回答，CoT 提升可解释性与复杂题准确率，但增加时延与 token 成本。

## 六、常见误区
认为 CoT 对所有任务都有效；忽略推理链错误的累积。

## 七、与开源书/权威来源对应
Wei 2022 首次系统展示 CoT 增益；Brown 2020 奠定少样本基础。

## 八、面试题
零样本 CoT 为何能起作用？哪些任务无效？

## 九、演进与趋势
从手动示范到自动推理路径搜索与验证。

## 十、小结
CoT 是释放大模型推理潜力的关键提示技术。
