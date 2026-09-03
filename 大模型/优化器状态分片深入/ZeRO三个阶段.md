# ZeRO 三个阶段

> 对应 Rajbhandari et al., 2020；与 优化器状态分片总览深入 衔接。

## 一、背景与挑战

不同分片粒度在显存节省与通信量间权衡，需理解三阶段差异。

## 二、核心原理

Stage1 分片优化器状态；Stage2 追加分片梯度；Stage3 再分片参数，每卡仅持当前层参数。

## 三、数学形式

显存随 stage：$O(12\Phi)$ → $O(8\Phi+4\Phi/N)$ → $O(4\Phi+12\Phi/N)$（N 为卡数）。

## 四、代码实现

```python
stage = 3 if model_huge else 2
ds_config["zero_optimization"]["stage"] = stage
```

## 五、与其他对比

- Stage3 显存最优但 all-gather 参数通信最频。
- 与 FSDP深入 的 sharding 等价概念对应。

## 六、常见误区

- Stage3 误当免费，参数 all-gather 通信显著。
- 小 N 下分片收益有限。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- ZeRO 三阶段区别？答：依次分片优化器状态、梯度、参数，显存更省但通信更重。

## 九、演进

Stage1 → Stage2 → Stage3。

## 十、小结

三阶段逐步分片，按模型规模与通信预算选 stage。
