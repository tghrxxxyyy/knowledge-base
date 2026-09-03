# TorchDynamo 与图捕获

> 对应 PyTorch 2.x Dynamo/Inductor；与 模型编译总览 衔接。

## 一、背景与挑战

Python 动态性使图捕获难；Dynamo 用 CPython 帧评估钩子提取 FX 图而不改用户代码。

## 二、核心原理

Dynamo 在字节码层守卫（guard）捕获子图，未捕获部分回退 eager；后端（Inductor）把 FX 图生成 Triton/C++ 代码。

## 三、数学形式

图捕获率 $=\frac{\text{编译子图 ops}}{\text{总 ops}}$；回退比例高则收益低。

## 四、代码实现

```python
@torch.compile
def f(x): return model(x)
```

## 五、与其他对比

- 比 TorchScript（需标注）更无痛；
- 与 FX 图直出兼容。

## 六、常见误区

- 动态 shape/控制流致频繁重编译（recompiles）；
- guard 失效致静默回退。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Dynamo 如何不侵入捕获图？答：字节码守卫钩子提取 FX 子图，余下回退 eager。

## 九、演进

TorchScript → FX → Dynamo+Inductor。

## 十、小结

TorchDynamo 以低侵入图捕获降低编译使用门槛。
