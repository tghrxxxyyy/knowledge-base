# 校准度量：ECE 与 NLL

> 对应 Naeini et al., *Obtaining Well Calibrated Probabilities*, 2015；可靠性图。

## 一、背景与挑战

如何量化“校准好不好”？需可比较指标。

## 二、核心原理

ECE 按置信分桶比频率差；可靠性图可视化；NLL 也与校准相关；Brier 分数综合精度与校准。

## 三、数学形式

$Brier=\frac{1}{n}\sum_i \|\hat p_i - y_i\|^2$；$ECE$ 加权绝对差（见总览）。

## 四、代码实现

```python
def ece(probs, labels, bins=10):
    edges = np.linspace(0,1,bins+1)
    err=0
    for lo,hi in zip(edges[:-1],edges[1:]):
        m=(probs>lo)&(probs<=hi); 
        if m.sum()>0: err+=abs(m.sum()/len(probs)*(labels[m].mean()-probs[m].mean()))
    return err
```

## 五、与其他对比

- 与 模型评测指标深入（准确率不反映校准）对照。
- 与 不确定性估计深入（熵/互信息指标）互补。

## 六、常见误区

- 分桶数影响 ECE 数值（少桶低估）。
- 只报准确率掩盖失校。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：ECE 含义？答：各置信桶内“正确率-平均置信”的加权平均，越小越校准。

## 九、演进

Brier → ECE → 自适应分桶/可靠性图。

## 十、小结

ECE/Brier 是校准量化主力，须与准确率同报。
