# JSON Schema与结构化调用

> 对应 Patil et al., *Gorilla*, 2023（API 调用正确性）；约束解码相关工作（Willard & Louf, *Efficient Guided Generation*, 2023）。

## 一、背景与挑战

自由文本调用需要脆弱的正则解析，任何括号、引号、字段名错误都会导致执行失败。
结构化调用要求输出严格符合类型约束的参数对象，这与自回归采样的自由度天然冲突，需要在提示、解码、校验三层协同。

## 二、核心原理

- 工具契约用 JSON Schema 表达：字段类型、必填项、枚举、取值范围，既给模型看也给校验器用。
- 约束解码（受语法/有限状态机引导）在每步把不合法 token 的概率置零，从生成阶段保证语法正确。
- 语法正确不等于语义正确：仍需业务层校验（如枚举外的取值、单位、越权 ID），并把校验错误回灌供模型修正。

## 三、数学形式

约束解码把词表按状态机可接受集合 $A(s_t)$ 做掩码：$\tilde P(v\mid s_t)=\frac{P(v\mid s_t)\mathbb{1}[v\in A(s_t)]}{\sum_{u\in A(s_t)}P(u\mid s_t)}$。

该操作等价于在合法语言 $L$ 上做条件化 $P(y\mid y\in L)$，保证结构合法且不改变合法串之间的相对概率排序。

## 四、代码实现

```python
from jsonschema import validate, ValidationError

SCHEMA = {"type": "object",
          "properties": {"city": {"type": "string"},
                         "unit": {"enum": ["c", "f"]}},
          "required": ["city"]}

def safe_call(llm, msgs, tool, retries=2):
    for _ in range(retries + 1):
        args = llm.json(msgs, schema=SCHEMA)     # 约束解码产出 dict
        try:
            validate(args, SCHEMA); return tool.run(**args)
        except ValidationError as e:
            msgs.append({"role": "user", "content": f"参数不合法: {e.message}"})
    raise RuntimeError("参数修正失败")
```

## 五、与其他对比

- 与自由文本 + 正则解析：结构化调用把失败从「解析后崩溃」前移到「生成时不可能非法」，可靠性差距显著。
- 与代码即动作（生成 Python 调用）：后者表达力更强、可组合，但沙箱与安全成本更高，审计也更难。

## 六、常见误区

- Schema 里只写类型不写语义描述，模型无法区分近似字段（如 start_date 与 created_at）。
- 用极深嵌套 Schema，约束状态机复杂、模型填参正确率下降，宜扁平化并拆分工具。
- 把重试次数设得很大掩盖了描述不清的根因，重试应配合错误归因统计。

## 七、与开源书对应

- datawhalechina/llm-universe（结构化输出与解析器实践）：https://github.com/datawhalechina/llm-universe
- dair-ai/Prompt-Engineering-Guide（输出格式控制技巧）：https://github.com/dair-ai/Prompt-Engineering-Guide

## 八、面试题

- 约束解码为什么不会破坏概率分布的合理性？答：它是对合法集合的重归一化，合法串的相对似然不变，只是把非法分支的质量重新分配。
- 结构合法但语义错怎么办？答：在执行前加业务校验与幂等检查，并把结构化错误信息回灌，让模型基于具体报错做一次定向修正。

## 九、演进

正则解析文本命令 → 强约束提示与少样本示例 → JSON Schema 契约 → 语法引导解码 → 契约驱动的工具注册与自动测试。

## 十、小结

结构化调用的核心是把工具契约变成可机器验证的对象，用解码约束保语法、用业务校验保语义。
