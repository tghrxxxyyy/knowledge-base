# 资源隔离与MIG

> 对应 cgroups / Kubernetes ResourceQuota / GPU 切片（NVIDIA MIG）。MIG 把 A100 切为多实例。

## 一、背景与挑战

租户间需隔离 CPU、显存、带宽，避免单租户吃满整卡影响他人。

## 二、核心原理

用 cgroups 限 CPU 与内存；用 NVIDIA MIG 把单卡切成多实例；K8s 限显存请求与限制。

## 三、数学形式

显存隔离：$mem_i \le MIG_{slice}$，超分比 $O=\frac{\sum req}{phys}\le 1$（硬隔离）或 $>1$（超卖）。

## 四、代码实现

```python
spec = {"nvidia.com/gpu": 1, "nvidia.com/mig-1g": 1}
k8s.create(ns="tenant-a", resources=spec)
```

## 五、与其他对比

- 与 多租户总览（隔离维度）衔接。
- 与 容灾与多区域部署深入（区域级隔离）对照。

## 六、常见误区

- 显存 limit 设错致 OOMKill。
- MIG 切片过小不支持大模型。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- MIG 作用？答：把单 GPU 切硬隔离实例，租户间显存互不可见，防嘈邻效应。

## 九、演进

进程级 → cgroups → MIG 硬切。

## 十、小结

资源隔离是租户安全的底座，显存隔离最关键。
