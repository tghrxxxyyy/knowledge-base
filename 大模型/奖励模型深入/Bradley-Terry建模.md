# Bradley-Terry奖励建模

> 对应偏好概率模型。

## 一、背景与挑战

如何由成对偏好学连续奖励。

## 二、核心原理

假设偏好概率由奖励差经 sigmoid：$P(y_w\succ y_l)=\sigma(r(y_w)-r(y_l))$；最大化该似然。

## 三、数学形式

$\mathcal L = -\mathbb E_{(x,y_w,y_l)}\log\sigma(r(x,y_w)-r(x,y_l))$。

## 四、代码实现

```python
loss = -F.logsigmoid(rm(c)-rm(l)).mean()
```

## 五、与其他对比

- 与 直接偏好优化深入（同源自 BT 但消去 r）理论同源。
- 与 过程监督与结果监督深入（奖励形态）衔接。

## 六、常见误区

- 直接套 BT 忽略标注噪声（可加标签平滑）。
- 奖励尺度任意（只差有意义）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- BT 模型含义？答：偏好概率由奖励差 sigmoid 给出，似然即训练目标。

## 九、演进

点wise → BT 配对 → 含不确定性 BT。

## 十、小结

Bradley-Terry 是偏好学习的数学基础，连接标注与奖励。
