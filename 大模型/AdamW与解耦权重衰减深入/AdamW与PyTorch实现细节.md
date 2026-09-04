# AdamW与PyTorch实现细节

> 对应 pytorch/pytorch 的 `torch.optim.AdamW` 源码与 karpathy/nanoGPT。

## 一、背景与挑战
不同框架对 AdamW 的实现细节（如 eps 位置、amsgrad、fused 内核）会影响数值结果与性能，理解差异可避免踩坑。

## 二、核心原理
PyTorch 的 AdamW 在 step 中先对参数乘 `(1-lr*wd)` 再做自适应减项；`eps` 默认加在 sqrt(vhat) 之后，而非分母内部（即 `sqrt(vhat)+eps`）。

## 三、形式化与数学基础
分母形式：

$ denom = \sqrt{\hat v_t} + \epsilon $

可选 amsgrad 维护 `max_v = max(max_v, vhat)` 防止二阶矩骤降带来的不稳定。

## 四、代码实现
```python
import torch
# fused 实现需 PyTorch >= 2.0 与 GPU
opt = torch.optim.AdamW(
    params, lr=3e-4, betas=(0.9, 0.95), eps=1e-8,
    weight_decay=0.1, amsgrad=False, fused=True,
)
for x, y in loader:
    opt.zero_grad()
    loss = model(x, y).loss
    loss.backward()
    opt.step()
```

## 五、与其他技术对比
`fused=True` 将更新融合进单个 CUDA 内核，显存与速度更优；原生 Python 循环版本更易调试但更慢。

## 六、常见误区
在 CPU 上盲目开 `fused=True` 会报错；混合精度下 eps 选 1e-8 与 1e-15 结果差异明显。

## 七、与开源书/权威来源对应
pytorch/pytorch `torch/optim/adamw.py`；karpathy/nanoGPT 使用非 fused 版以兼容性强。

## 八、面试题
问：eps 加在根号内还是外？答：PyTorch 加在外，部分实现加在内，需对齐。

## 九、演进与趋势
Fused 优化器与 8bit/FP8 优化器（如 bitsandbytes）正在降低显存占用。

## 十、小结
熟悉实现细节可在复现论文与跨框架迁移时避免隐性误差。
