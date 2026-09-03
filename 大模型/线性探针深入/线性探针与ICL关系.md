# 线性探针与上下文学习（ICL）

> 对应 Olsson et al., 2022（归纳头）；Akyürek et al., *What Learning Algorithm Learns In-Context?*, 2022.

## 一、背景与挑战

ICL 中模型从演示习得任务；线性探针可检测“任务身份/格式”是否在某层被线性编码。

## 二、核心原理

用线性探针在中间层预测当前演示的任务标签或输入-输出映射，观察 ICL 表征何时“锁定”任务。

## 三、数学形式

任务识别准确率 $a(l)=\text{probe}_l(\text{task\_id}\mid h^{(l)})$；峰值层 $l^*=\arg\max_l a(l)$。

## 四、代码实现

```python
for l in range(L):
    H = get_hidden(demos, l)
    acc[l] = logistic(H, task_ids).score(H, task_ids)
```

## 五、与其他对比

- 与 回路分析深入（归纳头机制）互补解释 ICL。
- 与 线性探针深入 总览同方法。

## 六、常见误区

- 探针检测到任务信息不代表理解机制全貌。
- 演示顺序影响探针信号。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 线性探针如何帮助理解 ICL？答：定位任务信息在哪些层变线性可辨，辅助刻画 ICL 形成过程。

## 九、演进

行为评测 → 探针定位 → 机制回路。

## 十、小结

线性探针为 ICL 提供“表示何时学会任务”的观测窗口。
