# 概念激活向量TCAV

> 对应 Kim et al., *Interpretability Beyond Feature Attribution: Testing with Concept Activation Vectors (TCAV)*, ICML 2018。

## 一、背景与挑战

用户关心的是「模型是否用了某个人类概念」，而非某个像素或 token 的权重。TCAV 提供了以概念为单位的敏感度检验框架。

## 二、核心原理

TCAV 用正负样例集训练线性分类器得到概念方向，再用输出对该方向的方向导数衡量敏感度。

- 概念向量 $v_C$ 取分类超平面法向量，代表「更像该概念」的方向。
- 概念敏感度是模型输出沿该方向的方向导数；对样本集取正号比例得到 TCAV 分数，并用随机概念做显著性检验。

## 三、数学形式

$$S_{C,k}(x)=\nabla h_k\big(f_l(x)\big)\cdot v_C,\qquad \mathrm{TCAV}_{C,k}=\frac{\big|\{x\in X_k: S_{C,k}(x)>0\}\big|}{|X_k|}$$

需与随机概念方向构成的零分布做统计检验，避免把噪声方向当作有效概念。

## 四、代码实现

```python
import torch
def tcav_score(grads, v_c):
    v = torch.nn.functional.normalize(v_c, dim=-1)
    s = grads @ v
    return float((s > 0).float().mean())
print(tcav_score(torch.randn(64, 32), torch.randn(32)))
```

## 五、与其他对比

- 与特征归因（如积分梯度）对照：TCAV 以人类概念为单位，粒度更贴近业务语义。
- 与 表示工程与激活引导 衔接：同样使用概念方向，但 TCAV 只做度量不做干预。

## 六、常见误区

- 概念样例集构造不当（与目标类高度共现），得到的方向混杂类别信息。
- 不做随机概念显著性检验，任意方向也可能得到高分。

## 七、与开源书对应

- d2l-zh（梯度、方向导数与线性分类基础）：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course（评测与解释性实践索引）：https://github.com/mlabonne/llm-course

## 八、面试题

- TCAV 分数含义？答：模型输出沿概念方向导数为正的样本占比，衡量概念敏感度。
- 必要的对照实验？答：随机概念方向构成零分布，做统计显著性检验。

## 九、演进

像素级归因 → 概念级敏感度（2018）→ 自动概念发现 → 与稀疏特征字典结合。

## 十、小结

TCAV 把归因单位从特征提升到人类概念，其可信度依赖样例集设计与显著性检验。
