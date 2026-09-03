# JSON 模式约束

> 对应 JSON schema 引导生成（Outlines/jsonformer）。

## 一、背景与挑战

需严格字段名、类型、必填，普通生成易丢字段或类型错。

## 二、核心原理

由 schema 构建 FSM：依次约束键名、冒号、值类型（string/number/array/object），遇类型切换相应掩码。

## 三、数学形式

键集合 $K$；类型函数 $T(k)\in\{\text{str,int,bool,arr,obj}\}$；逐字段约束 $P(y_k|T(k))$。

## 四、代码实现

```python
from outlines import generate
gen = generate.json(model, schema)     # schema: pydantic/model
obj = gen(prompt)
```

## 五、与其他对比

- 与 语法约束深入（CFG）同思路不同语法。
- 与 函数调用结构化深入 配合。

## 六、常见误区

- enum 值未列全致拒生成。
- 嵌套过深状态爆炸。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- JSON 约束如何实现？答：由 schema 生成 FSM，逐字段掩码键名与值类型。

## 九、演进

整块 JSON → 字段级约束 → 流式 JSON。

## 十、小结

JSON 模式以 schema 驱动约束，保证字段与类型正确。
