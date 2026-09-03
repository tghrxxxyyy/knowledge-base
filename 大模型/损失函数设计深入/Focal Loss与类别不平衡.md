# Focal Loss 与类别不平衡

> 对应 Lin et al., *Focal Loss for Dense Object Detection*, 2017；Cui et al., *Class-Balanced*, 2019。

## 一、背景与挑战

正负样本/类别极度不平衡时，CE 被易分样本主导，难分少数类学不好。

## 二、核心原理

**Focal Loss** 在 CE 上乘调制因子 `(1-p_t)^γ`，降低易分样本权重、聚焦难分样本：
```
FL = -α_t (1-p_t)^γ log p_t
```
γ 越大越聚焦难例；α 平衡正负。

## 三、数学形式

见上；p_t 为模型对真实类的置信度。

## 四、代码实现

```python
# 简化版 focal
ce = F.cross_entropy(logits, y, reduction='none')
pt = torch.exp(-ce)
fl = (1-pt)**gamma * ce
```

## 五、关键要点

- γ 常取 2。
- 与 class weight、重采样互为补充。
- 类别极不平衡（长尾）时尤其有用。

## 六、与其他对比

- CE 平等看待样本；focal 重难例。

## 七、常见误区

- focal 替代一切——仍需配合重采样/重加权。

## 八、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- Focal loss 如何缓解类别不平衡？

## 十、演进

CE → weighted CE → focal → class-balanced。

## 十一、小结

把注意力留给「难啃的骨头」。
