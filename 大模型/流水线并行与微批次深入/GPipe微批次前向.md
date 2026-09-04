# GPipe微批次前向

> 对应 Huang 2019 (GPipe 论文) 与 Shoeybi 2019 对照。

## 一、背景与挑战
GPipe 用微批次将小批量细分，在设备间流水以省显存，但采用"先全部前向、再全部反向"的调度。

## 二、核心原理
前向阶段 $m$ 个微批依次流完所有 stage，缓存各微批激活；反向阶段逆序对每微批做反向，梯度在 stage 内累积后更新。

## 三、形式化与数学基础
激活显存：
$ M_{\\mathrm{act}} = m \\cdot \\sum_{l} \\mathrm{act}_l $，
因需缓存全部微批激活供反向，显存随 $m$ 线性增长，但单微批显存降为 $1/m$。

## 四、代码实现
```python
# 概念：先全前向再全反向
activations = []
for micro in microbatches:
    a = micro
    for stage in stages:
        a = stage(a)
    activations.append(a)
# 反向逆序
for a in reversed(activations):
    a.backward()
```

## 五、与其他技术对比
与 1F1B 比，GPipe 激活占用更高($O(m\\cdot p)$)但调度简单、数值稳定；1F1B 牺牲少量确定性换显存。

## 六、常见误区
误区一：GPipe 无气泡——前向段仍有 $(p-1)$ 片空闲。误区二：微批越小越省——激活随 $m$ 增，过小则通信比例升。误区三：GPipe 仅用于推理，实际为训练设计。

## 七、与开源书/权威来源对应
Huang 2019 GPipe；Shoeybi 2019 Megatron 采用类似流水但不同调度。

## 八、面试题
问：GPipe 为何激活占用高？答：需缓存所有微批激活至反向。问：与 1F1B 显存差异？答：GPipe 为 $O(mp)$，1F1B 为 $O(m)$。

## 九、演进与趋势
GPipe 思想融入 JAX/PyTorch 自动分段；与重计算结合控激活。

## 十、小结
GPipe 以微批次均摊显存，是流水线训练的基础范式，但激活峰值促生 1F1B。
