# 图像Captioning流水线

> 对应 图像描述生成（如 Vinyals et al. 2015 「Show and Tell」、Anderson et al. 2018 「Bottom-Up Top-Down」）及作为指令数据底座。

## 一、背景与挑战

高质量 caption 是构建多模态指令数据的基础原料。自动 captioning 需兼顾准确性、细节与多样性。挑战是细粒度物体/属性/关系描述、避免错误传播到下游指令。

## 二、核心原理

流水线含：检测（物体框与标签）→ 属性/关系抽取 → 语言生成（自回归或模板+模型润色）。现代方案直接用多模态大模型生成 dense caption 或 region caption，再由 LLM 整合为段落，作为下游指令合成输入。

## 三、数学形式

检测给出区域特征 \{r_i\}，注意力语言模型：
p(w_t\mid w_{<t}, I)=\mathrm{softmax}(W h_t),\quad h_t=\mathrm{Attn}(E_{w_{<t}}, \{r_i\})
生成整图描述可由区域 caption 聚合：D = \mathrm{Agg}(\{d_i\}_{i=1}^k)。

## 四、代码实现

```python
def make_caption(regions, llm):
    parts = [f"{r['label']} at {r['box']}" for r in regions]
    prompt = "Describe image from parts:\n" + "\n".join(parts)
    return llm(prompt)
```

## 五、与其他对比

相比单阶段 caption，区域聚合更细；相比纯 LLM 看图，检测提供 grounding；质量决定下游指令上限。可作为 re-captioning 的输入。

## 六、常见误区

用错 caption 污染指令；忽略区域定位精度；混淆全局与密集 caption；未过滤低质描述。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：caption 流水线组成？答：检测→属性→语言生成。
- Q：为何需细粒度？答：下游指令靠其保真。
- Q：与指令数据关系？答：caption 是合成原料。

## 九、演进

从模板到端到端；从全局到 dense/region caption；用 MLLM 直接生成高质量描述。

## 十、小结

Captioning 流水线为多模态指令数据提供可信视觉事实基底，其细节与准确性直接决定下游合成质量。
