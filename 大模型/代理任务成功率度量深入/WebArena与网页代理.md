# WebArena与网页代理

> 对应 Zhou et al. 2023 "WebArena: A Realistic Web Environment for Building Autonomous Agents"。

## 一、背景与挑战

网页代理需在真实网站（购物、论坛、Git）多步操作。评测难点是可复现沙箱、状态依赖、以及部分完成度度量。

## 二、核心原理

WebArena 提供自托管网页环境，任务有可程序化验证的最终状态。评测用任务成功率，并支持轨迹分析（步数、回退）。

## 三、数学形式

任务成功率：

$$
\mathrm{SR}=\mathbf{1}[\mathrm{state}=\mathrm{goal}]
$$

效率（步数惩罚）：

$$
E=\mathrm{SR}\cdot e^{-\lambda\cdot\mathrm{steps}}
$$

## 四、代码实现

```python
import math
def efficiency(sr, steps, lam=0.05):
    return sr*math.exp(-lam*steps)

print(round(efficiency(1, 10),3))
```

## 五、与其他对比

相比 ToolBench（API），WebArena 是图形/状态环境；相比 AgentBench 单一，它多站点真实。

## 六、常见误区

误区一：仅看最终状态忽略效率。误区二：沙箱不可复现。误区三：忽略导航错误累积。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：WebArena 特点？答：自托管真实网页沙箱，状态可验证。
- Q：为何加效率指标？答：避免用超多步侥幸达成。

## 九、演进

WebArena 建立可复现网页代理评测标准，推动网页自动化研究。

## 十、小结

WebArena 以真实可复现网页环境，使代理成功率度量具备状态级验证。
