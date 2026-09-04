# ORPO与SFT及DPO对比

> 对应 Hong 2024 ORPO 与 Rafailov 2023 DPO。

## 一、背景与挑战
厘清 ORPO 在方法谱系中的位置，指导选型。

## 二、核心原理
SFT 仅模仿；DPO 两阶段(先 SFT 后偏好)；ORPO 单阶段联合。三者目标与数据需求不同。

## 三、形式化与数学基础
SFT：$\min -\log\pi_\theta(y|x)$
DPO：配对偏好损失
ORPO：SFT + $\lambda$ OR 项

## 四、代码实现
# 三方法损失对照
loss_sft = -logp_y.mean()
loss_dpo = dpo_loss(logp_w, logp_l)
loss_orpo = loss_sft + lam * orpo_term(logp_w, logp_l)

## 五、与其他技术对比
ORPO 省对齐阶段但需配对数据；DPO 更灵活可调；SFT 最简单但无偏好。

## 六、常见误区
以为 ORPO 比 DPO 总是更优——取决于数据与算力；忽略 $\lambda$ 平衡。

## 七、与开源书/权威来源对应
Hong 2024 对比实验；Rafailov 2023 DPO；huggingface/trl 三 Trainer 并存。

## 八、面试题
问：何时选 ORPO？答：有配对偏好且希望一步完成微调+对齐、节省流程时。

## 九、演进与趋势
ORPO 与在线采样、课程学习结合。

## 十、小结
ORPO 在 SFT 与 DPO 间取折衷，流程最简。
