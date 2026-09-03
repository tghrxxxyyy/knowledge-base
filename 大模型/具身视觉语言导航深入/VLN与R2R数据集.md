# VLN与R2R数据集

> 对应 Anderson et al. 2018 「Vision-and-Language Navigation: Interpreting visually-grounded navigation instructions in R2R」。

## 一、背景与挑战

视觉语言导航（VLN）要求智能体根据自然语言指令在真实感 3D 环境中逐步移动到达目标。R2R 基于 Matterport3D 构建，提供多标注路径指令。挑战是跨模态对齐、长程决策与泛化到未见环境。

## 二、核心原理

环境为离散可导航图（panorama 节点 + 边）。智能体每步观测全景，用视觉编码器提特征，与指令做跨模态注意力，由策略网络选下一节点。训练用教师强制（teacher forcing）或学生回放（DAgger）。

## 三、数学形式

指令词嵌入 \{w_t\}，观测 v_t。跨模态上下文：
c_t = \mathrm{Attn}(E_{nav}, [\{w_t\}; v_t])
动作分布 \pi(a_t\mid c_t)。损失（教师强制）：
L = -\sum_t \log \pi(a_t^* \mid c_t)
其中 a_t^* 为专家动作。

## 四、代码实现

```python
def nav_step(model, obs, instr, state):
    vis = model.vis_enc(obs)            # 全景特征
    ctx = model.cross_attn(instr, vis)
    logits = model.policy(ctx)
    return logits.argmax(-1)            # 选下一节点
```

## 五、与其他对比

相比视觉问答，VLN 是序列决策；相比纯规划，需感知-语言对齐；R2R 为离散图，后续 RxR/REVERIE 增加连续与指代。评测用 SR（成功率）与 SPL。

## 六、常见误区

用 Seq2Seq 直接映射指令到动作忽视反馈；忽略 panorama 多视角；混淆离散与连续环境；未处理长指令记忆。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：VLN 任务？答：按语言指令在 3D 环境逐步导航。
- Q：R2R 环境？答：Matterport3D 离散可导航图。
- Q：评测指标？答：SR 与 SPL（路径效率）。

## 九、演进

从 R2R 到 RxR（多语）、REVERIE（指代）、再到连续控制 VLN-CE；LLM 作规划器。

## 十、小结

VLN 与 R2R 奠定了「语言-视觉-动作」闭环研究基础，是具身智能的核心基准。
