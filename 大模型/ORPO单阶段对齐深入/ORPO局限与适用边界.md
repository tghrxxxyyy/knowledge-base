# ORPO局限与适用边界

> 对应 Hong 2024 ORPO 与 Rafailov 2023 DPO。

## 一、背景与挑战
单阶段联合并非总优于两阶段，需识别边界。

## 二、核心原理
SFT 与偏好目标在同一优化中竞争，$\lambda$ 难调；缺少独立对齐阶段可能限制复杂偏好学习。

## 三、形式化与数学基础
当 $\mathcal{L}_{SFT}$ 与 $\mathcal{L}_{OR}$ 梯度方向冲突，单阶段易陷入次优平衡。

## 四、代码实现
# 监控两项独立损失
for step, batch in enumerate(loader):
    nll = sft_loss(...)
    or_term = orpo_term(...)
    if step % 50 == 0:
        print(nll.item(), or_term.item())

## 五、与其他技术对比
复杂偏好 DPO/RLHF 更可控；简单指令对齐 ORPO 够用且更快。

## 六、常见误区
把所有数据都当配对强行 ORPO；不监控 NLL 致语言能力下滑。

## 七、与开源书/权威来源对应
Hong 2024 指出边界；huggingface/trl 文档说明适用。

## 八、面试题
问：ORPO 不适合什么？答：需精细多轮偏好或强分布约束的复杂对齐任务。

## 九、演进与趋势
两阶段与单阶段混合、分阶段解冻。

## 十、小结
ORPO 适合轻量对齐，复杂场景仍倾向两阶段。
