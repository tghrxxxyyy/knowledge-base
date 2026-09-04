# ORPO数据需求与效率

> 对应 Hong 2024 ORPO 与 Ouyang 2022 InstructGPT。

## 一、背景与挑战
单阶段方法对数据配比与规模有新要求，影响成本。

## 二、核心原理
ORPO 每个 batch 同时含 SFT 样本与配对偏好样本，需平衡两者比例以免对齐项淹没语言建模。

## 三、形式化与数学基础
有效损失为加权平均：
$\mathcal{L}=(1-\alpha)\mathcal{L}_{SFT}+\alpha\,\mathcal{L}_{OR}+\lambda\mathcal{L}_{OR}$
实现上常用 $\lambda$ 直接控制 OR 项权重。

## 四、代码实现
# 混合 batch 训练
for sft_x, sft_y, p_x, pw, pl in loader:
    nll = sft_loss(model, sft_x, sft_y)
    or_term = orpo_term(model, p_x, pw, pl)
    loss = nll + lam * or_term
    loss.backward()

## 五、与其他技术对比
DPO 需先跑完 SFT；ORPO 数据需同时含两类，组织更复杂但总步数更少。

## 六、常见误区
配对数据占比过高致语言能力下降；SFT 样本与偏好样本分布不一致。

## 七、与开源书/权威来源对应
Hong 2024 讨论数据与效率；datawhalechina/llm-universe 涉及数据准备。

## 八、面试题
问：ORPO 总训练成本如何？答：单阶段省去独立对齐，但每步含两类损失，整体通常更快。

## 九、演进与趋势
自动配比搜索、课程式由 SFT 主导向 OR 主导过渡。

## 十、小结
ORPO 以数据组织换流程简化，配比平衡是关键。
