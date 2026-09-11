# JSON Schema 约束生成

> 对应 Willard & Louf 2023 constrained decoding; Zheng 2023 LLM-as-judge; Ouyang 2022 InstructGPT。

## 一、背景与挑战

工具调用与函数调用要求严格、可被 `json.loads` 解析的 JSON 输出。但 LLM 自由生成常在字段名、括号配对、字符串转义上出错，尤其涉及嵌套对象、数组、枚举与必填项时。把 JSON Schema 编译为有限状态机（FSM），逐字符 / 逐 token 约束生成，能从根本上保证输出可被解析，是 Agent 工具调用的工程标配。

挑战在于：JSON 是上下文敏感结构（括号深度、键-值-逗号转移），需 FSM 显式建模；且现代分词器会把字符串切分为多个子词，约束必须覆盖 BPE 切分路径，否则子词越界会让约束失效。

## 二、核心原理

Schema 决定字段顺序、类型（string/number/object/array/enum）、必填与可选。解码器维护一个解析状态（当前键、期望类型、括号深度、是否在字符串内），每步只允许符合该状态的 token/字符。例如：在 object 内期望键名 → 发射 `"key"` → 期望冒号 → 期望值 → 按类型继续（字符串需闭合引号、数字需合法数字、object 递归下钻）。枚举字段直接把候选值编译进 FSM 的对应边。

可在字符级或 token 级实现：字符级直观但需逐字符解码慢；token 级快，但需把 Schema 映射回词表并覆盖子词拼接（如枚举值被切成多 token 时需允许整条路径）。

一个稳健实现要点是「分词感知」：枚举值或字段名若被 BPE 切成多 token，FSM 必须允许整条 token 路径，而非只允单词级。字符串内部还需建模转义（如双引号、反斜杠、\uXXXX 形式的 Unicode 转义），否则破坏 JSON。字符级实现直观但逐字符慢，token 级快但需把 Schema 映射回词表——二者数学等价，工程取舍在吞吐。

## 三、形式化与数学基础

合法对象集合为 Schema 的实例语言 $I(S)$。约束分布：

$$ p'(c_t) = \frac{p(c_t \mid w_{<t} \in \mathrm{prefix}(I(S)))}{Z(w_{<t})} $$

当 $w_{<t}$ 是某合法对象的真前缀时才有非空续写集合；否则 FSM 进入死状态需回退（见「约束解码与采样冲突处理」）。括号深度 $d$ 与位置 $pos$ 构成 FSM 状态 $(d, pos, field)$，转移由 Schema 与 JSON 文法共同决定：

$$ (d, pos) \xrightarrow{c} (d', pos') \iff c \in \mathrm{allowed}(d, pos) $$

字符级与 token 级约束在数学上等价，区别仅在 FSM 的字母表（字符 vs token）。

## 四、代码实现

```python
import torch

def build_schema_fsm(schema):
    # 把 JSON Schema 编译为状态机；状态含 深度/当前字段/期望类型
    # 以官方最新文档与所用库为准（如 outlines / vllm guided）
    return SchemaFSM(schema)

def json_schema_step(fsm, state, logits, vocab_size):
    allowed = [i for i in range(vocab_size)
               if fsm.accepts(state, i)]      # 词表级合法集合
    mask = torch.full((vocab_size,), float("-inf"))
    for tid in allowed:
        mask[tid] = 0.0
    return (logits + mask).softmax(-1)

class SchemaFSM:
    def accepts(self, state, token_id):
        # 依据当前深度/字段/类型判断是否允许该 token
        raise NotImplementedError
```

## 五、与其他技术对比

| 方案 | 重试 | 可解析保证 | 贴近 API 契约 |
|------|------|------------|----------------|
| few-shot 示例 | 需要 | 否 | 中 |
| 正则约束 | 不需要 | 近似 | 弱 |
| CFG 引导 | 不需要 | 是 | 中 |
| JSON Schema FSM | 不需要 | 是（100%） | 强 |

JSON Schema 约束相对 CFG 更贴近 API 契约，相对 few-shot 零重试。

## 六、常见误区

误区一：枚举字段随便生成即可——若枚举词未被切成单一 token，约束需覆盖其 BPE 切分整条路径。误区二：字符串转义无需约束——引号、反斜杠、Unicode 转义都需 FSM 建模，否则破坏 JSON。误区三：约束解决取值语义——结构合法不代表业务合理，需下游校验。误区四：字符级更可靠——token 级更快，只要 FSM 分词感知即可等价。

## 七、与开源书·权威来源对应

- Willard & Louf 2023 系统讨论 JSON Schema 编译为约束（guided generation）。
- Zheng et al., *LLM-as-a-Judge*, 2023（结构化输出）。
- Ouyang et al., *InstructGPT*, 2022（指令遵循）。
- 实现见 `vllm-project/vllm` guided/json 与 huggingface/transformers 生成。

## 八、面试题

1. JSON 约束如何处理嵌套与逗号？FSM 显式建模「键→冒号→值→逗号→下一个键→右括号」转移，逐状态限定下一字符。
2. 为何要分词感知？枚举/字符串可能被 BPE 切成多 token，约束需覆盖整条 token 路径，否则子词越界。
3. 字符串转义如何约束？FSM 在「字符串内」状态允许 `\"` `\\` `\uXXXX` 等转义序列，遇到未转义 `"` 才闭合。
4. 死状态如何处理？当前前缀无法续成合法对象时回退（删 token 或重置），配合硬遮罩兜底。

生产实现多把 Schema 静态编译为 FSM 并缓存，重复调用零编译开销。流式场景下，边生成边校验（partial validation）可在不完整 JSON 上提前发现结构错误，减少等待。与 JSON mode 双保险时，约定「约束为准、mode 为辅」，约束失败回退而非信任 mode。跨语言 SDK（Python/TS/Go）已把该能力封装为生成参数。

## 九、演进与趋势

把 Schema 编译为分词感知的有限自动机，避免子词越界；与模型原生 JSON mode 组成双保险。趋势是统一 Schema / 类型注解 / CFG 为「可组合约束 DSL」，并支持流式增量解析以提升长输出吞吐。

Schema 静态编译为 FSM 并缓存，重复调用零编译开销。
字符串转义（双引号、反斜杠、\uXXXX）必须建模，否则破坏 JSON。
分词感知：枚举/字段名被 BPE 切多 token 时允许整条路径。
流式场景用 partial validation 提前发现结构错误。
与 JSON mode 双保险约定「约束为准、mode 为辅」。
FSM 显式建模键-值-逗号-右括号转移，逐状态限定下一字符。
字符级直观但逐字符慢，token 级快但需映射回词表。
枚举未进词表时需子词拼接，约束覆盖 BPE 切分。
嵌套对象递归下钻，数组下标由 FSM 跟踪完成态。
死状态回退（删 token 或重置）配合硬遮罩兜底。
字符串内 Unicode 转义需 FSM 接受 \uXXXX 形式。
跨语言 SDK（Python/TS/Go）已封装为生成参数。
评测看 json.loads 成功率与首轮成功率。
生产侧缓存编译后的 FSM，按 Schema 版本管理。

## 十、小结

JSON Schema 约束生成把 API 契约编译为 FSM，逐 token 强制结构合法，保证 `json.loads` 零失败。它是 Agent 工具调用的工程标配：理解括号深度、字符串转义与分词感知三条要点，是把 Schema 约束稳健落地的关键。
