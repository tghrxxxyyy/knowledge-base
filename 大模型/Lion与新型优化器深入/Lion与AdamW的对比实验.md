# Lion与AdamW的对比实验

> 对应 Chen 2023 Lion (arXiv:2302.06675) 与 Loshchilov & Hutter 2019 AdamW。

## 一、背景与挑战
是否值得从成熟的 AdamW 切换到 Lion？需从效果、稳定性、资源三方面权衡。

## 二、核心原理
两者均采用解耦权重衰减；差异在更新幅度：AdamW 自适应缩放，Lion 符号恒定。Lion 对学习率 η 与 β1 更敏感。

## 三、形式化与数学基础
AdamW 步长：`η·mhat/√vhat`；Lion 步长：`η·sign(m)`。前者幅度随参数异质，后者统一，故 Lion 需更小 η（典型 1e-4~3e-4 级）与更大 β1（如 0.95）。

## 四、代码实现
```python
# 经验超参对照
adamw_cfg = dict(lr=3e-4, betas=(0.9, 0.95), wd=0.1)
lion_cfg  = dict(lr=1e-4, betas=(0.95, 0.98), wd=0.1)  # lr 更小
```

## 五、与其他技术对比
论文报告 Lion 在 ViT、语言建模上略优，但收益受任务与调参影响；AdamW 更鲁棒、易复现。

## 六、常见误区
用 AdamW 的 lr 直接喂 Lion 会发散；忽略 β 差异导致收敛慢。

## 七、与开源书/权威来源对应
Chen 2023 Lion 给出多任务对比；Loshchilov & Hutter 2019 提供 AdamW 基线。

## 八、面试题
问：迁移到 Lion 首要改什么？答：把 lr 降约 3~10 倍并调高 β1。

## 九、演进与趋势
自动化选择优化器（按规模/数据）是实际部署方向。

## 十、小结
Lion 在显存与特定任务上占优，但 AdamW 仍是稳妥默认选择。
