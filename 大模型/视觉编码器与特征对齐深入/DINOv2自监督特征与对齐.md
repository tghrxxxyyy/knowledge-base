# DINOv2自监督特征与对齐

> 对应 Caron et al. 2021 「Emerging Properties in Self-Supervised Vision Transformers」及 Oquab et al. 2023 「DINOv2」。

## 一、背景与挑战

有监督特征受标签语义限制，难以覆盖几何、材质等通用属性。DINO 系列自监督训练 ViT，无需标签即可产出可迁移的密集特征。挑战在于保持特征通用性、减少训练数据偏差、并在下游对齐任务中有效利用。

## 二、核心原理

DINO 用教师-学生自蒸馏：学生网络预测教师对同图不同裁剪的输出的概率分布，以无标签对比式目标对齐。DINOv2 扩展为多阶段数据整理（去重、相似检索、平衡）与蒸馏，产出在分类、检索、深度、语义分割等多任务均强的特征，可作为冻结视觉编码器用于 MLLM。

## 三、数学形式

教师输出经 centering 与 temperature 处理：
P_t = \mathrm{softmax}((g_\theta(x_t) - c)/\tau_t)
学生目标最小化与教师的 cross-entropy：
L = -\sum_k P_t^{(k)} \log \mathrm{softmax}(g_s(x_s)/\tau_s)^{(k)}
其中 c 为运行平均中心，防止模式坍塌。

## 四、代码实现

```python
import torch.nn.functional as F

def dino_loss(p_student, p_teacher, temp_s=0.1, temp_t=0.04):
    p_t = F.softmax((p_teacher - p_teacher.mean(0)) / temp_t, dim=-1)
    p_s = F.log_softmax(p_student / temp_s, dim=-1)
    return - (p_t * p_s).sum(-1).mean()
```

## 五、与其他对比

相比 CLIP，DINOv2 特征更密集、更通用，适合分割/深度；相比 MAE 重建式，DINO 判别式特征语义更整齐；在 MLLM 中可替代 CLIP 塔获得更细粒度视觉先验，但需重新对齐到语言空间。

## 六、常见误区

以为 DINOv2 可直接做 zero-shot 分类，其实它产出特征需线性探针；忽略其强归纳于数据整理质量；混淆 DINO 与 iBOT 的 mask 目标；误认为特征可解释。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：DINO 如何防止坍塌？答：centering 与 teacher 停止梯度，强制不同视图一致。
- Q：DINOv2 特征为何通用？答：大规模整理数据 + 多目标蒸馏，覆盖多任务属性。
- Q：可替代 CLIP 做 MLLM 视觉塔吗？答：可以，并对密集预测更有利。

## 九、演进

iBOT 引入 masked image modeling；DINOv2 引入 register token 减少伪特征；与 CLIP 融合（如 SigLIP+DINOv2 双塔）成为趋势。

## 十、小结

DINOv2 证明了自监督可产出接近全-purpose 的视觉特征，为对齐任务提供了不依赖语言标签的强视觉先验，是视觉编码器谱系的重要一极。
