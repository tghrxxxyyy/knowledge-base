# 训练恢复与Checkpoint策略

> 对应 microsoft/DeepSpeed 检查点与 pytorch/pytorch `save/load`。

## 一、背景与挑战
NaN 后若从头重训代价巨大。合理的 checkpoint 与恢复机制可在最近健康点续训。

## 二、核心原理
周期性保存模型权重、优化器状态、数据采样器步数、随机数状态，恢复时回滚到最后一个有限(loss)检查点，并可降 lr 或调稳策略。

## 三、形式化与数学基础
检查点 `C = {θ, {m,v}, step, rng_state}`。恢复：`θ ← C.θ`，`opt.load_state_dict(C.opt)`，从 `C.step` 继续。

## 四、代码实现
```python
# 保存
torch.save({"model": model.state_dict(),
            "opt": opt.state_dict(),
            "step": step}, "ckpt.pt")
# 恢复
ck = torch.load("ckpt.pt")
model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"])
```

## 五、与其他技术对比
DeepSpeed 提供分片检查点与异步保存，适合超大规模；单卡 `torch.save` 简单但占内存峰值。

## 六、常见误区
只存模型不存优化器状态，恢复后动量/二阶矩丢失，训练轨迹断裂。

## 七、与开源书/权威来源对应
microsoft/DeepSpeed 检查点文档；pytorch/pytorch 序列化 API。

## 八、面试题
问：恢复为何要存优化器状态？答：保留 m/v 与 step，避免自适应估计冷启动。

## 九、演进与趋势
增量检查点与云存储直接落盘降低中断风险。

## 十、小结
健全的 checkpoint 是应对发散的工程保险，必须包含优化器与采样状态。
