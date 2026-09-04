# AMP的loss scaling机制

> 对应 pytorch/pytorch `GradScaler` 与 NVIDIA/TensorRT-LLM 训练。

## 一、背景与挑战
FP16 梯度幅值常远小于可表示最小正规数（~6e-5），直接回传会下溢为 0，参数不更新。

## 二、核心原理
loss scaling 把损失乘大系数 S，使梯度同步放大；反向后再除 S 还原，避免下溢。动态 scaler 监测 inf/NaN 并自适应调整 S。

## 三、形式化与数学基础
$ \tilde g = S \cdot g $，回传后 `g = \tilde g / S`。若检测到 `inf/NaN`，说明 S 过大，下一步减半。

## 四、代码实现
```python
scaler = torch.cuda.amp.GradScaler(init_scale=2**16)
with torch.autocast(dtype=torch.float16):
    loss = model(x).loss
scaler.scale(loss).backward()
scaler.unscale_(opt)
torch.nn.utils.clip_grad_norm_(params, 1.0)
scaler.step(opt); scaler.update()
```

## 五、与其他技术对比
BF16 范围足够，通常不需要 loss scaling；FP16 必须靠它保梯度。

## 六、常见误区
在 BF16 下使用 GradScaler 是多余甚至有害的；它专为 FP16 设计。

## 七、与开源书/权威来源对应
pytorch/pytorch `GradScaler` 文档；NVIDIA/TensorRT-LLM 在 FP16 路径使用动态 scaling。

## 八、面试题
问：loss scaling 防什么？答：防 FP16 梯度下溢归零。

## 九、演进与趋势
BF16 普及后 scaling 逐渐被淘汰，FP8 又引入新缩放策略。

## 十、小结
loss scaling 是 FP16 训练的护栏，用 BF16 可省略。
