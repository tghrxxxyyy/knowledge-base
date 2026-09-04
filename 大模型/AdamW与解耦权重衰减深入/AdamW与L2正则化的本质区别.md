# AdamW与L2正则化的本质区别

> 对应 Loshchilov & Hutter 2019 AdamW (arXiv:1711.05101) 与 Kingma & Ba 2015 Adam。

## 一、背景与挑战
许多工程师在切换 SGD 到 Adam 时直接沿用 `weight_decay`，却发现泛化下降、训练不稳定。根因在于 Adam 语境下的 weight_decay 并不等于 L2 正则。

## 二、核心原理
SGD 下：更新为 `-η(∇L + λθ)`，等价于在目标中加 `(λ/2)||θ||²`。Adam 下若把 λθ 加进梯度再走自适应路径，该项被 `mhat/sqrt(vhat)` 缩放，等效强度随参数历史大幅变化，不再是干净的 L2。

## 三、形式化与数学基础
设梯度为 g，Adam 自适应归一化因子为 `c = 1/(sqrt(vhat)+eps)`，那么 L2 形式实际施加的衰减为 `η·c·λ·θ`，而 AdamW 施加 `η·λ·θ`。两者差别正是 `c` 这个与梯度历史相关的因子。

## 四、代码实现
```python
# 对比两种写法
opt_l2 = torch.optim.Adam(model.params, lr=1e-3, weight_decay=0.01)  # 旧式L2
opt_aw = torch.optim.AdamW(model.params, lr=1e-3, weight_decay=0.01) # 解耦
# 对 bias / norm 通常单独分组且不衰减
no_decay = ["bias", "norm"]
groups = [
    {"params": [p for n,p in model.named_parameters() if not any(k in n for k in no_decay)], "weight_decay": 0.01},
    {"params": [p for n,p in model.named_parameters() if any(k in n for k in no_decay)], "weight_decay": 0.0},
]
```

## 五、与其他技术对比
对 SGD，两者等价；对 Adam，L2 写法弱化且扭曲衰减。AdamW 在 ImageNet 与大语言模型预训练中均显示更低的验证误差。

## 六、常见误区
认为 `weight_decay` 数值可跨优化器直接迁移。实际上 AdamW 的 λ 与 Adam-L2 的 λ 语义不同，迁移时需重新搜索。

## 七、与开源书/权威来源对应
Kingma & Ba 2015 Adam (arXiv:1412.6980)；Loshchilov & Hutter 2019 AdamW。代码见 huggingface/transformers 的优化器分组逻辑。

## 八、面试题
问：如何把 Adam 改成等价 L2？答：用 AdamW 并把 decay 视为纯缩放，或手动在 step 后对参数乘 `(1-ηλ)`。

## 九、演进与趋势
现代框架默认区分二者，PyTorch 已弃用旧式语义，优化器接口趋向显式分组。

## 十、小结
理解衰减作用于参数空间还是梯度空间，是正确使用大模型优化器的前提。
