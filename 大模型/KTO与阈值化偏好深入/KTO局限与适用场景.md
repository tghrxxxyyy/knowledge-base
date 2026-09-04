# KTO局限与适用场景

> 对应 Ethayarajh 2024 KTO 与 Rafailov 2023 DPO。

## 一、背景与挑战
KTO 并非万能，理解其边界避免误用。

## 二、核心原理
KTO 依赖"可取/不可取"二元标签，难以表达细微偏好序；阈值设定引入额外超参敏感。

## 三、形式化与数学基础
效用基于参考点，当参考模型本身质量差时，相对改进的语义弱化，对齐信号变模糊。

## 四、代码实现
# 标签质量检查
def label_quality(labels):
    pos = sum(labels); neg = len(labels) - pos
    return min(pos, neg) / len(labels)   # 需两类均充足

## 五、与其他技术对比
细粒度排序任务 DPO/RLHF 更合适；粗反馈场景 KTO 占优。

## 六、常见误区
在需要微弱偏好区分的任务硬用 KTO；正类远多于负类未加权。

## 七、与开源书/权威来源对应
Ethayarajh 2024 讨论 KTO 局限；huggingface/trl 文档说明适用数据。

## 八、面试题
问：KTO 何时不如 DPO？答：当高质量成对偏好易得且需精细偏好序时。

## 九、演进与趋势
多阈值 KTO、与 pairwise 损失融合。

## 十、小结
KTO 适合非配对粗反馈，精细偏好仍需配对方法。
