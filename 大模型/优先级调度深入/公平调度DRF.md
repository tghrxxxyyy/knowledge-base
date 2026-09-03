# 公平调度DRF

> 对应 Ghodsi et al., *Dominant Resource Fairness*, NSDI 2011；与 优先级调度深入 / 多模型路由深入 衔接。

## 一、背景与挑战

多任务竞争 GPU/显存/算力，单一资源公平（如 CPU 公平）不公平。

## 二、核心原理

DRF 按各任务的主导资源（占用比例最高者）分配，使主导资源份额最公平，避免某资源被独占。

## 三、数学形式

任务 $i$ 主导资源 $d_i=\max_r \frac{u_{i,r}}{R_r}$；DRF 最大化 $\min_i d_i$ 分配份额。

## 四、代码实现

```python
def drf_alloc(tasks):
    return max(tasks, key=lambda t: min_share(t))   # 给最缺主导资源者
```

## 五、与其他对比

- 与 多模型并发隔离（资源配额）共享公平目标。
- 与 调度策略对比（公平类）互补。

## 六、常见误区

- 仅按 GPU 数公平，忽略显存主导任务饿死。
- DRF 在异构任务下需归一化口径。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- DRF 相对 max-min 公平？答：DRF 考虑多资源，按主导资源分配更公平，而非单资源均分。

## 九、演进

单资源公平 → DRF → 加权 DRF（带优先级）。

## 十、小结

DRF 在多资源竞争下实现公平，是集群调度理论基础。
