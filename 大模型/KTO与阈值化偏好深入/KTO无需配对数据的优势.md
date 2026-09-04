# KTO无需配对数据的优势

> 对应 Ethayarajh 2024 KTO 与 Ouyang 2022 InstructGPT。

## 一、背景与挑战
现实反馈多为单条(点赞/点踩、是否正确)，构造可靠配对成本高，KTO 直接消费这类数据。

## 二、核心原理
只要知道每个样本是否可取，即可计算相对参考模型的效用并优化，无需同 prompt 下成对比较。

## 三、形式化与数学基础
数据集为 $\{(x_i,y_i,d_i)\}$，$d_i\in\{0,1\}$ 表可取性，损失逐样本独立：
$\mathcal{L}=\frac{1}{N}\sum_i u(r(x_i,y_i);d_i)$
其中 $u$ 为阈值化效用。

## 四、代码实现
# 单条反馈数据集构造
samples = []
for x, y, score in logs:
    desirable = score >= threshold
    samples.append({"x": x, "y": y, "desirable": desirable})

## 五、与其他技术对比
DPO 必须同 prompt 配对否则分布偏移；KTO 放宽此约束，更适合线上反馈积累。

## 六、常见误区
把不同 prompt 的样本强行配对当 DPO 用引入噪声；忽略可取性阈值的选择偏差。

## 七、与开源书/权威来源对应
Ethayarajh 2024 强调 KTO 在真实反馈场景的优势；datawhalechina/llm-universe 介绍反馈数据。

## 八、面试题
问：KTO 如何利用线上单条反馈？答：按可取性标签直接构造效用损失，无需配对整理。

## 九、演进与趋势
流式 KTO、与在线探索结合。

## 十、小结
非配对友好是 KTO 的工程最大卖点。
