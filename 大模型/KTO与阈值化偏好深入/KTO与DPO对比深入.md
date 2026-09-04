# KTO与DPO对比深入

> 对应 Ethayarajh 2024 KTO 与 Rafailov 2023 DPO。

## 一、背景与挑战
两者都基于隐式奖励与参考模型，但数据形态与损失设计不同，需明确取舍。

## 二、核心原理
DPO 优化成对偏好概率 $\sigma(r_w-r_l)$；KTO 优化单样本到阈值的效用。DPO 需配对，KTO 接受正负单例。

## 三、形式化与数学基础
DPO 损失：
$\mathcal{L}_{DPO}=-\mathbb{E}[\log\sigma(\beta\log\frac{\pi_\theta(y_w)}{\pi_{ref}(y_w)}-\beta\log\frac{\pi_\theta(y_l)}{\pi_{ref}(y_l)})]$
KTO 把上式拆成阈值化单样本项。

## 四、代码实现
# DPO vs KTO 数据形态
dpo_pair = {"x": q, "chosen": yw, "rejected": yl}
kto_item = {"x": q, "y": y, "label": "desirable"}  # 无需配对

## 五、与其他技术对比
配对数据丰富时 DPO 略优；非配对/混合反馈时 KTO 更实用。KTO 对噪声标签更鲁棒。

## 六、常见误区
把 KTO 当 DPO 的严格推广——二者目标函数不等价；认为 KTO 不需要任何偏好标注。

## 七、与开源书/权威来源对应
Rafailov 2023 DPO；Ethayarajh 2024 KTO；huggingface/trl 两 Trainer 并存。

## 八、面试题
问：何时选 KTO 而非 DPO？答：当反馈以单条正负形式存在、缺乏可靠配对时。

## 九、演进与趋势
KTO 与 DPO 混合损失、课程式配对补充。

## 十、小结
KTO 与 DPO 互补，数据形态决定选型。
