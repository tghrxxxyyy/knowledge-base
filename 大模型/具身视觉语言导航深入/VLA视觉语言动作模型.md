# VLA视觉语言动作模型

> 对应 视觉-语言-动作模型研究（如 Brohan et al. 2023 「RT-2」、Octo/OpenVLA 等）。

## 一、背景与挑战

让机器人直接从视觉与语言指令输出动作，需统一感知-语言-控制。挑战是动作空间连续、数据异构、以及把互联网视觉知识迁移到机器人控制。RT-2 用大规模 VLM 微调输出离散化动作 token。

## 二、核心原理

VLA 以 VLM 为骨干，把动作表示为 token（离散化或连续回归），与文本、图像共同序列建模。训练数据含 (图像, 指令, 动作) 三元组。推理时模型自回归输出动作 token，解码为机器人控制量。

## 三、数学形式

动作离散化 a = \mathrm{Quant}(a_{cont})。序列建模：
L = -\sum_{t}\log p_\theta(x_t \mid x_{<t}),\quad x_t\in\mathcal{V}_{text}\cup\mathcal{V}_{img}\cup\mathcal{V}_{act}
动作解码 \hat{a}=\mathrm{Dequant}(x_{act}) 送控制器。

## 四、代码实现

```python
def vla_forward(model, img, instr, act_tokens=None):
    seq = build_multimodal_seq(img, instr, act_tokens)
    return model(seq)                 # 输出含动作 token 分布
```

## 五、与其他对比

相比传统机器人 pipeline（感知→规划→控制），VLA 端到端更简、可借用 VLM 知识；相比 VLN 仅导航，VLA 含连续操作；代价是数据与仿真依赖。

## 六、常见误区

以为 VLM 直接能控机器人，实需动作 token 化与微调；忽略动作量化精度；混淆仿真与真实部署；未处理动作安全约束。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：VLA 是什么？答：视觉-语言-动作统一模型，输出动作 token。
- Q：RT-2 思路？答：VLM 微调输出离散动作 token。
- Q：优势？答：端到端、借互联网知识迁移。

## 九、演进

从 RT-2 到 OpenVLA 开源；连续动作 Diffusion Policy 结合；多机器人数据共享。

## 十、小结

VLA 把大模型的世界知识与机器人动作统一建模，是迈向通用具身智能的关键架构。
