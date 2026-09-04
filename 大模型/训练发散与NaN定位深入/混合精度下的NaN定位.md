# 混合精度下的NaN定位

> 对应 pytorch/pytorch AMP 与 NVIDIA/TensorRT-LLM FP16 训练。

## 一、背景与挑战
FP16 训练出现 NaN 时，常因 loss scaling 过大导致梯度 inf，或激活下溢为 0 后参与除法。

## 二、核心原理
动态 GradScaler 在检测到 inf/NaN 时会跳过 step 并降低 scale；若连续触发，说明前向已产生非有限值，需回溯算子。

## 三、形式化与数学基础
`scaler.scale(loss)` 放大 loss；反向得 `S·g`；若 `S·g` 溢出 inf，则 `scaler` 标记本步无效并 `S ← S/2`。

## 四、代码实现
```python
scaler = torch.cuda.amp.GradScaler()
with torch.autocast(dtype=torch.float16):
    loss = model(x).loss
before = [p.detach().clone() for p in params]
scaler.scale(loss).backward()
scaler.step(opt); scaler.update()
# 若参数未变且 scale 骤降，说明出现 inf
```

## 五、与其他技术对比
BF16 几乎不出现此类 NaN（范围大），故混合精度 NaN 多见于 FP16 路径。

## 六、常见误区
scale 一直减半却未排查前向，白白浪费大量步数。

## 七、与开源书/权威来源对应
pytorch/pytorch `GradScaler` 动态更新逻辑；NVIDIA/TensorRT-LLM FP16 路径。

## 八、面试题
问：scale 骤降说明什么？答：检测到 inf/NaN，该步被跳过，需查前向数值。

## 九、演进与趋势
迁移到 BF16 可大幅降低此类问题发生。

## 十、小结
FP16 NaN 多源于缩放与溢出，BF16 是治本方案。
