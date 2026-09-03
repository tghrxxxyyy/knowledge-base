# Toolformer与工具学习

> 对应 Schick et al., *Toolformer: Language Models Can Teach Themselves to Use Tools*, NeurIPS 2023。

## 一、背景与挑战

早期工具使用依赖大量人工标注的调用轨迹，或依赖极强模型的零样本提示能力，中小模型难以稳定学会「何时该调用」。
Toolformer 的问题设定是：能否让模型用自监督方式，自己决定在哪些位置插入工具调用才真正降低预测困惑度。

## 二、核心原理

- 采样候选调用：在文本的若干位置，用少量示例提示模型生成可能的 API 调用及参数。
- 执行并过滤：真实执行得到返回值，只保留那些「插入调用结果后，后续 token 的损失显著下降」的样本。
- 用过滤后的增广语料继续做常规语言建模微调，工具调用因此内化为语言能力，而不是外挂解析规则。

## 三、数学形式

设位置 $i$ 处插入调用 $c$ 与返回 $r$，用加权交叉熵 $L_i(z)=-\sum_{j\ge i} w_{j-i}\log P_\theta(x_j\mid z, x_{<j})$ 度量前缀 $z$ 的帮助程度。

保留准则为 $L_i(\varnothing)-L_i(c\!\to\! r)>\tau$，即调用带来的困惑度增益超过阈值 $\tau$ 才认为该调用有用。

## 四、代码实现

```python
def filter_calls(model, text, pos, cands, tau=1.0):
    base = weighted_ce(model, prefix="", text=text, start=pos)
    kept = []
    for c in cands:
        r = execute(c)                     # 真实执行 API
        aug = weighted_ce(model, prefix=f"[{c}->{r}]", text=text, start=pos)
        if base - aug > tau:               # 调用确实降低了损失
            kept.append((c, r))
    return kept
```

## 五、与其他对比

- 与 ReAct：ReAct 靠提示在推理时交错思考与动作，无需训练；Toolformer 把能力写进权重，小模型也可用但需数据管线。
- 与 指令微调式工具训练（如 ToolLLM 用大量 API 轨迹做 SFT）：后者覆盖面广、依赖标注质量，前者标签由损失增益自动产生。

## 六、常见误区

- 误以为过滤准则是「答案对不对」；实际准则是对后续 token 的预测增益，因此对无信息量的调用天然抑制。
- 忽略执行成本：候选采样与执行会放大 API 调用量，需要限流与缓存。
- 把工具内化当成万能：训练时未覆盖的工具仍需靠提示或再训练引入，扩展性弱于外部工具注册表。

## 七、与开源书对应

- rasbt/LLMs-from-scratch（自监督语言建模与微调流程的底层实现）：https://github.com/rasbt/LLMs-from-scratch
- dair-ai/Prompt-Engineering-Guide（工具增强与 ReAct 对照）：https://github.com/dair-ai/Prompt-Engineering-Guide

## 八、面试题

- Toolformer 的自监督信号从哪来？答：来自插入调用结果后未来 token 的加权交叉熵下降，等于用语言建模损失当作工具有用性的自动标注器。
- 何时选内化工具而非外部函数调用？答：工具集稳定、延迟敏感、模型偏小时内化更划算；工具频繁增删时外部注册表更灵活。

## 九、演进

人工标注工具轨迹 → 自监督增广（Toolformer）→ 大规模 API 指令微调 → 工具检索加泛化调用 → 训练与推理时编排结合。

## 十、小结

Toolformer 的贡献不是某个 API，而是给出「用预测增益自动判定工具是否该调用」的可扩展标注思路。
