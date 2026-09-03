# 公平调度DRF

> 对应 DRF（Dominant Resource Fairness, Ghodsi et al., 2011）；YARN 与 K8s 调度。DRF 论文给出形式化。

## 一、背景与挑战

多租户争抢异构资源（GPU、显存），需公平而非仅 FIFO。

## 二、核心原理

DRF 按各租户主导资源（dominant resource）做最大最小公平分配，防某资源被垄断。

## 三、数学形式

DRF 份额 $s_i=\max_r \frac{u_{i,r}}{C_r}$，最大化最小 $s_i$；保证公平。

## 四、代码实现

```python
def drf(asks):
    return min(asks, key=lambda a: max_share(a))
```

## 五、与其他对比

- 与 队列调度策略（公平队列）共享理念。
- 与 资源隔离与MIG（资源维度）衔接。

## 六、常见误区

- 仅按 GPU 数忽略显存主导。
- 静态公平忽略突发。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- DRF 为何按主导资源？答：防止某资源被单一租户占满，做最大最小公平。

## 九、演进

FIFO → 加权公平 → DRF 多资源公平。

## 十、小结

公平调度在多资源维度保证租户间公平衡量。
