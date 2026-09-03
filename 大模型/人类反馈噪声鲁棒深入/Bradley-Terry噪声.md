# Bradley-Terry 噪声鲁棒

> 对应 Ouyang et al., 2022；Gao et al., 2023；Casper et al., 2023。

## 一、背景与挑战

标准 BT 假设标注无错，噪声下过度自信致奖励失真。

## 二、核心原理

用标签平滑、噪声感知 BT（估计标错率）、或 pairwise 置信加权，降低错标影响。

## 三、数学形式

噪声 BT：$P(y_w\succ y_l)=\sigma(r_w-r_l)\cdot(1-\eta)+\frac{\eta}{2}$ 猜测项。

## 四、代码实现

```python
p = (1 - eta) * sigmoid(rw - rl) + eta / 2
loss = -log(p).mean()
```

## 五、与其他对比

- 与标注噪声建模共享噪声项。
- 与奖励模型退化与塌缩深入共享 RM。

## 六、常见误区

- 忽略标错率致过自信。
- 标签平滑过度损信号。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 噪声 BT 改了什么？答：加猜测项吸收标错，降过自信。

## 九、演进

标准 BT → 标签平滑 → 噪声感知 BT。

## 十、小结

噪声感知 BT 是把噪声纳入似然的稳健基。
