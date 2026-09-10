# 图像生成 Agent

> 对应 Rombach et al. 2022 *Stable Diffusion*、Zhang et al. 2023 *ControlNet*、dair-ai Prompt Engineering Guide 与 LlamaIndex 多模态 Agent 实践。

## 一、背景与挑战

单次文生图（text-to-image）常出现「词不达意、细节崩坏、与需求不符」的问题。图像生成 Agent 把生成模型嵌入 Agent 闭环：由 LLM 负责「理解需求—优化提示词—调度生成/编辑工具—评估成品—迭代」，让出图从「一次赌博」变为「多轮打磨」。挑战在于：(1) 提示词到画面的语义对齐；(2) 多轮迭代如何量化「好不好」；(3) 编辑而非重绘以保持一致性；(4) 成本控制（多模型调用昂贵）。

## 二、核心原理

图像生成 Agent 通常由四角色协同：

- **规划器（LLM）**：拆解需求，决定「先出草图、再局部编辑、再风格化」。
- **提示词优化器**：把用户意图改写为模型友好的结构化提示（含主体、风格、光照、构图）。
- **生成/编辑工具**：Stable Diffusion、ControlNet（姿态/边缘约束）、Inpainting（局部重绘）。
- ** critic（评判器）**：用 VLM 或规则评估画面是否符合需求，给出修改指令。

闭环为「生成→评估→编辑→再评估」，直到满足约束或达步数上限。

## 三、形式化与数学基础

扩散模型逐步去噪。从噪声 $x_T$ 迭代到数据 $x_0$，训练目标常为预测噪声 $\epsilon_\theta$：

$$L_{\mathrm{simple}} = \mathbb{E}_{t,x_0,\epsilon}\big[\|\epsilon - \epsilon_\theta(x_t, t, c)\|^2\big]$$

其中 $c$ 为文本条件（来自 CLIP/T5 编码）。ControlNet 引入额外条件 $c_{\mathrm{ctrl}}$（如边缘图），以可学习副本 $ \theta_c $ 控制结构：

$$\hat{x}_0 = \epsilon_\theta(x_t, t, c) + \omega \cdot \epsilon_{\theta_c}(x_t, t, c_{\mathrm{ctrl}})$$

Agent 的迭代可视为在图像空间上做受控优化，critic 提供梯度方向（自然语言形式）。

## 四、代码实现

示意「生成—VLM 评判—局部重绘」循环：

```python
def image_agent(goal, llm, sd_pipe, vlm, max_iter=3):
    prompt = llm.refine_prompt(goal)          # 提示词优化
    img = sd_pipe(prompt).images[0]
    for _ in range(max_iter):
        feedback = vlm.judge(img, goal)       # 评判：哪里不符
        if feedback.ok:
            return img
        mask, sub_prompt = llm.to_edit(feedback)
        img = sd_pipe.inpaint(img, mask, sub_prompt).images[0]
    return img
```

## 五、与其他技术对比

| 方式 | 交互 | 一致性 | 成本 | 适用 |
|------|------|--------|------|------|
| 单次文生图 | 无 | 低 | 低 | 灵感草图 |
| 提示词工程 | 手工 | 中 | 低 | 熟练用户 |
| 图像生成 Agent | 自动闭环 | 高 | 高 | 精准需求 |

Agent 用「自动化迭代」换「一致性」，代价是多次模型调用。

## 六、常见误区

- 误区一：提示词越长越好。冗长提示常引入冲突，结构化、分层更关键。
- 误区二：重绘破坏一致性。应优先 Inpainting/ControlNet 局部约束而非全图重来。
- 误区三：critic 必须多模态。简单规则（尺寸、是否含人）也能筛掉明显失败。

## 七、与开源书·权威来源对应

- Rombach et al., *High-Resolution Image Synthesis with Latent Diffusion (Stable Diffusion)*, 2022.
- Zhang et al., *Adding Conditional Control to Text-to-Image Diffusion (ControlNet)*, 2023.
- dair-ai, *Prompt Engineering Guide*：https://www.promptingguide.ai/
- LlamaIndex 多模态 Agent 文档。

## 八、面试题

- 图像生成 Agent 为何需要反思循环？一次生成 vs 多轮迭代的取舍？
- ControlNet 相比单纯文本条件，解决了什么一致性问题？
- 如何设计一个低成本的 critic，避免每轮都调用重 VLM？

## 九、演进与趋势

(1) 原生多模态生成：Emu、Chameleon 把图像生成纳入 LLM 词空间，Agent 调度更自然。(2) 视频生成 Agent：从单帧扩展到时序一致短片。(3) 可控性增强：深度、姿态、布局等多条件联合。(4) 端到端审美对齐：用人类偏好 RL 微调生成器。(5) 与 GUI Agent 结合，自动操作设计软件。

## 十、小结

图像生成 Agent 把「一次生成」升级为「理解—生成—评估—编辑」的自动闭环，核心是用 LLM 做提示词优化与反思、用 VLM 做 critic、用扩散/ControlNet 做可控生成。它用更高的调用成本换取更强的一致性与需求贴合度，是 AIGC 从玩具走向生产工具的关键形态。
