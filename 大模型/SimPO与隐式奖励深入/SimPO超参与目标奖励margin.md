# SimPO超参与目标奖励margin

> 对应 Meng 2024 SimPO 与 Loshchilov 2019 AdamW。

## 一、背景与挑战
SimPO 对 $\beta$、$\gamma$ 与学习率敏感，需合理设置以稳定收敛。

## 二、核心原理
$\beta$ 缩放奖励幅度，$\gamma$ 控制配对间隔，学习率决定优化步长；三者共同影响对齐强度。

## 三、形式化与数学基础
损失梯度随 $\beta/\gamma$ 比值变化，过大 $\beta$ 使 sigmoid 饱和，过小 $\gamma$ 弱化偏好信号。

## 四、代码实现
# 超参敏感性示意
for beta in [0.5, 1.0, 2.0]:
    for gamma in [0.5, 1.0, 2.0]:
        loss = simpo_margin_loss(rw, rl, gamma)
        print(beta, gamma, loss.item())

## 五、与其他技术对比
DPO 主要调 $\beta$；SimPO 多一个 $\gamma$ 维度但省参考模型显存。

## 六、常见误区
$\beta$ 与 $\gamma$ 同数量级冲突；学习率沿用 DPO 配置未重调。

## 七、与开源书/权威来源对应
Meng 2024 给出推荐超参区间；Loshchilov 2019 AdamW 用于优化。

## 八、面试题
问：如何选 $\gamma$？答：使优劣样本奖励差均值略大于 $\gamma$，既不被全部满足也不全被忽略。

## 九、演进与趋势
网格/贝叶斯超参搜索自动化。

## 十、小结
SimPO 调参围绕 $\beta$ 与 $\gamma$，需配合学习率协同调整。
