# JSON Schema 约束生成

> 对应 Willard & Louf 2023 constrained decoding; Zheng 2023 LLM-as-judge; Ouyang 2022 InstructGPT。

## 一、背景与挑战
工具调用与函数调用要求严格 JSON。把 JSON Schema 编译为有限状态机，逐字符约束生成，保证输出可被 json.loads 解析。

## 二、核心原理
Schema 决定字段顺序、类型、枚举与必填项。解码器维护当前键、期望类型与括号深度，仅允许符合结构的 token/字符。

## 三、形式化与数学基础
合法对象集合为 Schema 实例语言 I(S)。约束：
$ p'(c_t) = p(c_t \mid w_{<t} \in \text{prefix}(I(S))) / Z $
字符级或 token 级均可，token 级需把 Schema 映射到词表。

## 四、代码实现
```python
def json_schema_step(schema_fsm, state, logits, vocab):
    allowed = [i for i, tok in enumerate(vocab)
               if schema_fsm.accepts(state, tok)]
    return constrained_logits(logits, allowed)
```

## 五、与其他技术对比
相比 few-shot 示例，Schema 约束零重试、100% 可解析；相比 CFG 更贴近 API 契约。

## 六、常见误区
误区：枚举字段随便生成即可。若枚举未进词表需子词拼接，约束需覆盖 BPE 切分。

## 七、与开源书/权威来源对应
见 vllm-project/vllm 的 guided/json；huggingface/transformers 生成。参考 Willard & Louf 2023。

## 八、面试题
问：JSON 约束如何处理嵌套与逗号？
答：FSM 显式建模键-值-逗号-右括号转移，逐状态限定下一字符。

## 九、演进与趋势
把 Schema 编译为分词感知的有限自动机，避免子词越界。

## 十、小结
JSON Schema 约束生成是 Agent 工具调用的工程标配，保证结构化输出零失败。
