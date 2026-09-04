# PipeDream-2BW权重缓存

> 对应 Narayanan 2019 (PipeDream-2BW) 与 Narayanan 2021 分析。

## 一、背景与挑战
1F1B 中前向与反向之间参数已被优化器更新，反向若用新权重会产生语义偏差。2BW(weight stashing)缓存前向所用旧权重供反向使用。

## 二、核心原理
每个 stage 在每次前向前快照当前权重副本(最多 $p$ 个版本)，反向时取对应版本更新梯度；优化器实际只更新"最新"权重，旧版本仅用于反向计算。

## 三、形式化与数学基础
权重版本数上界为设备数 $p$：
$ \\#\\mathrm{versions} \\le p $，
显存增量 $p\\cdot\\Psi_{\\mathrm{stage}}$；保证反向用权重 $W^{(k)}$ 与前向一致，更新 $W \\leftarrow W - \\eta g(W^{(k)})$。

## 四、代码实现
```python
# 概念：缓存前向权重版本
weight_versions = {}
def forward(micro_id, x):
    weight_versions[micro_id] = stage.weight.clone()
    return stage(x)
def backward(micro_id, grad):
    w = weight_versions.pop(micro_id)
    stage.weight = w                 # 用旧权重反向
    stage.weight.grad = grad
    stage.weight = latest            # 还原最新权重供优化器
```

## 五、与其他技术对比
GPipe 不解耦权重版本(全前向后全反向，权重一致)；2BW 为异步更新付出的代价。Megatron 1F1B 同样需版本管理。

## 六、常见误区
误区一：缓存所有历史权重——实际仅 $p$ 个在途版本。误区二：版本管理无显存代价——增 $p$ 份 stage 权重。误区三：与梯度累积冲突，可在微批维度协调。

## 七、与开源书/权威来源对应
Narayanan 2019/2021 PipeDream；Shoeybi 2019 讨论权重一致性。

## 八、面试题
问：为何需 2BW？答：保证反向使用前向时权重版本。问：版本数上限？答：$p$ 个 stage。

## 九、演进与趋势
与异步流水线(PipeMare)结合，进一步解耦前后向节奏。

## 十、小结
2BW 以可控显存代价换来 1F1B 的正确性与显存优势，是异步流水线的基石。
