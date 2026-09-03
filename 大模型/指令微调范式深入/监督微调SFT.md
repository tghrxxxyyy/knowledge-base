# 监督微调（SFT）

> 对应 Ouyang et al., *InstructGPT*, 2022；SFT 是 RLHF 第一阶段，也是独立对齐手段。

## 一、背景与挑战

仅靠预训练权重无法直接产出有用、格式正确回答；需用高质量示范数据微调。

## 二、核心原理

在标注的（prompt, response）上做标准自回归交叉熵；作为后续偏好优化的初始化，也可单独作为能力模型。

## 三、数学形式

$\mathcal L_{SFT}=\-\mathbb E_{(x,y)}\sum_t\log p_\theta(y_t|x,y_{<t})$；学习率远小于预训练。

## 四、代码实现

```python
outputs = model(**tok(prompt, response))
loss = outputs.loss
loss.backward(); opt.step()
```

## 五、与其他对比

- 与 直接偏好优化深入（DPO 在 SFT 后做）衔接。
- 与 奖励模型深入（RLHF 中 SFT 提供初始化）对照。

## 六、常见误区

- SFT 数据噪声直接放大部分错误模式。
- 学习率过大破坏预训练知识（灾难性遗忘）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- SFT 与预训练损失区别？答：同是交叉熵，但数据为人写示范、序列短、学习率小、目标为对齐而非补语言。

## 九、演进

全参 SFT → LoRA 等参数高效 → SFT+DPO 流水线。

## 十、小结

SFT 把预训练知识对齐到示范格式，是几乎所有对齐流程的必经阶段。
