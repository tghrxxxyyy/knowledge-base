# 多模态 Agent 架构

> 对应 LlamaIndex / LangChain 多模态 Agent 文档、Liu et al. 2023 *LLaVA*、OpenAI 多模态函数调用实践。

## 一、背景与挑战

纯文本 Agent 的 observation 是字符串，而多模态 Agent 的 observation 可是图像、界面截图、文档图片、视频帧。这让「感知—思考—行动」循环更复杂：模型既要理解像素，又要把视觉信息转化为可决策、可记忆、可检索的表示。核心挑战是多模态信息如何在「认知核心、记忆、工具」三者间一致流动。

## 二、核心原理

多模态 Agent 以 VLM（视觉语言模型）为认知核心，架构通常含五层：

- **感知层**：图像/视频/文档经 VLM 编码为视觉 token 或文本描述。
- **认知层（VLM/LLM）**：基于多模态上下文做推理与决策。
- **工具层**：搜索、生成、编辑、代码执行等，可被多模态条件触发。
- **记忆层**：保存画面、关键帧摘要、向量与文本。
- **编排层**：ReAct/Plan 循环，串联上述组件。

典型形态：GUI Agent（截图→理解→点击）、视觉问答 Agent（检索图库→答）、文档理解 Agent（读 PDF→抽取）。

## 三、形式化与数学基础

多模态输入经编码器映射为统一 token 序列。设图像 $x_v$ 经 ViT 得 patch 特征，投影为视觉 token $Z_v$，文本 token 为 $Z_t$：

$$Z_v = W_p \cdot \mathrm{ViT}(x_v), \qquad Z = [Z_v; Z_t]$$

VLM 自回归生成动作或文本：

$$a_t \sim \pi_\theta(\cdot \mid Z, o_{<t}, \tau_{<t})$$

其中 $o_{<t}$ 为历史多模态观察。记忆召回可建模为向量检索：

$$z^* = \arg\max_{z\in\mathcal{M}} \mathrm{sim}(q, z)$$

$q$ 可为文本或图像查询，实现跨模态召回。

## 四、代码实现

示意多模态 Agent 的组件装配：

```python
class MultimodalAgent:
    def __init__(self, vlm, tools, memory):
        self.vlm, self.tools, self.memory = vlm, tools, memory

    def step(self, image, goal):
        vis_tokens = self.vlm.encode_image(image)      # 视觉编码
        self.memory.add(vis_tokens)                    # 存入记忆
        ctx = self.memory.retrieve(goal)               # 多模态召回
        decision = self.vlm.decide(goal, ctx)          # 决策
        if decision.tool:
            return self.tools.call(decision.tool, decision.args)
        return decision.answer
```

## 五、与其他技术对比

| 组件 | 纯文本 Agent | 多模态 Agent |
|------|--------------|--------------|
| 观察 | 字符串 | 图/视频/文档 |
| 认知 | LLM | VLM |
| 记忆 | 文本+向量 | 文本+图像+向量 |
| 工具触发 | 文本意图 | 视觉+文本意图 |

多模态 Agent 的本质差异在 observation 的「像素性」与状态表示的「异质融合」。

## 六、常见误区

- 误区一：把图像转文字就够。OCR/描述会丢空间与细节信息，复杂版式需原生 VLM。
- 误区二：所有画面都存向量。图向量成本高，应只存关键帧与摘要。
- 误区三：VLM 能直接当 planner。复杂任务仍需显式规划与工具调度。

## 七、与开源书·权威来源对应

- LlamaIndex Multi-Modal Agents：https://docs.llamaindex.ai/
- LangChain 多模态文档。
- Liu et al., *Visual Instruction Tuning (LLaVA)*, 2023.
- OpenAI 多模态函数调用指南（以官方最新文档为准）。

## 八、面试题

- 多模态 Agent 的 observation 与纯文本 Agent 有何本质不同？对记忆与规划带来什么影响？
- 为何不把所有图像都转成文字描述再处理？何时必须保留像素级信息？
- 多模态记忆的「混合召回」应如何设计以兼顾成本与覆盖？

## 九、演进与趋势

(1) 原生多模态 VLM 替代「OCR+描述」拼接，理解与决策更连贯。(2) 统一 token 空间让图像、视频、音频可在同一上下文推理。(3) 多模态 RAG 成熟：以图搜文、以文搜图、跨模态检索。(4) 与 GUI/文档/视频 Agent 融合成通用「视觉操作员」。(5) 边缘部署：小 VLM 在端侧做实时感知。

## 十、小结

多模态 Agent 在纯文本 Agent 之上叠加了「像素级感知」与「异质状态融合」，以 VLM 为认知核心，通过感知、认知、工具、记忆、编排五层协同完成视觉任务。其关键不在堆模型，而在让图像信息在决策与记忆中低成本、高保真地流动。
