# ControlNet 控制生成

> 对应 Zhang et al.(2023)。

## 一、核心概念

ControlNet 复制 U-Net 编码器为可训练副本，输入额外条件(边缘/canny/姿态/深度)，在保持预训练生成能力的同时精确控制构图。训练时锁定原 U-Net，只训控制分支，省显存。

## 二、关键要点

- 锁定主干防灾难性遗忘。
- 多 ControlNet 可叠加多种条件。

## 三、与开源书的对应

- Zhang et al., *Adding Conditional Control to Text-to-Image Diffusion Models*, 2023.

## 七、面试题

- ControlNet 为何要锁定原 U-Net 只训控制分支？
