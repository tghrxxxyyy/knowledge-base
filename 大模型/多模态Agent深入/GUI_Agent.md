# GUI Agent 图形界面智能体

> 对应 SeeClick / CogAgent / OSWorld 等。

## 一、核心概念

GUI Agent 通过截图理解界面，输出动作(点击坐标/输入文本/滚动)，循环操作软件/APP 完成任务。挑战：界面元素定位、跨应用、长任务规划、可靠性。常需大量合成轨迹训练。

## 二、关键要点

- 坐标预测需高分辨率 VLM。
- 动作空间设计影响可行性。

## 三、与开源书的对应

- OSWorld: https://github.com/xlang-ai/OSWorld

## 七、面试题

- GUI Agent 相比 API Agent 的主要难点？
