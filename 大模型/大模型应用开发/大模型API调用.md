# 大模型 API 调用

> 对应 datawhalechina/llm-universe「如何使用大模型 API」；协议参考 OpenAI Chat Completions API 与各厂商 OpenAI 兼容端点、vLLM 推理服务。

## 一、背景与挑战

掌握 API 是应用开发第一步。主流大模型通过 HTTP 接口（以 OpenAI 兼容的 `/v1/chat/completions` 为主）暴露能力，本地开源模型也可由 vLLM 等提供 OpenAI 兼容服务。开发者需要理解消息结构、核心参数与工程化要点，否则会遇到截断、超时、成本失控、重试雪崩等问题。

挑战：(1) 参数语义不清导致效果不符预期；(2) 长输出被 `max_tokens` 截断；(3) 忽略超时/重试，线上易雪崩；(4) system 与 user 角色混用削弱指令；(5) 多厂商 SDK 差异。

## 二、核心原理

主流调用方式：OpenAI 兼容 `/v1/chat/completions`、各厂商原生 SDK、开源模型本地推理（vLLM 暴露 OpenAI 兼容端口）。消息为角色列表：`system`（系统指令，固定在前）、`user`（用户输入）、`assistant`（模型/历史回复）、`tool`（工具结果）。

关键参数：

- `model`：模型标识。
- `messages`：对话消息列表。
- `temperature`：采样温度（0 近确定性 ~ 2 更随机）。
- `max_tokens`：最大生成长度（注意是生成侧上限，不含输入）。
- `stream`：是否流式返回。
- `tools`：工具/函数定义，启用函数调用。
- `timeout` / `max_retries`：控制挂起与重试。

## 三、形式化与数学基础

自回归生成按条件概率逐 token 采样，温度 $T$ 缩放 logits：

$$P_T(w_t\mid w_{<t}) = \frac{\exp(z_{w_t}/T)}{\sum_{w}\exp(z_w/T)}$$

$T\to 0$ 趋近贪心（确定性高），$T$ 增大分布更平（更随机）。`max_tokens` 限制序列长度 $n\le N_{max}$，输出被截断即 $n=N_{max}$ 时仍无终止符。计费按输入+输出 token 总数；流式不改变该总量。

## 四、代码实现

用 OpenAI SDK 调用（可指向任意兼容端点）：

```python
from openai import OpenAI
client = OpenAI(api_key="sk-...", base_url="https://api.openai.com/v1")
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role":"system","content":"你是助手"},
              {"role":"user","content":"用一句话解释RAG"}],
    temperature=0.3, max_tokens=200, timeout=30)
print(resp.choices[0].message.content)
```

本地 vLLM 只需改 `base_url="http://localhost:8000/v1"` 即可同套代码调用开源模型。

## 五、与其他技术对比

| 方式 | 适用 | 特点 |
|------|------|------|
| OpenAI SDK | 通用 | 生态全 |
| 厂商原生 SDK | 特定平台 | 功能新 |
| vLLM 兼容端点 | 私有部署 | 成本可控 |
| 直接用 HTTP | 极致控制 | 繁琐 |

优先 OpenAI 兼容接口以最大化可移植性。

## 六、常见误区

- 把 system 与 user 混用，弱化系统指令，模型不听话。
- 忽略重试与超时，线上偶发抖动即雪崩。
- 不设 `max_tokens`，长回答被截断还以为是模型问题。
- 生产问答设高 temperature，结果不稳定不可复现。
- 在代码里硬编码密钥，未走环境变量/密钥管理。

## 七、与开源书·权威来源对应

- llm-universe「如何使用大模型 API」：https://datawhalechina.github.io/llm-universe/
- OpenAI API 文档（Chat Completions、Streaming、Function Calling）。
- vLLM 文档（OpenAI 兼容服务部署）。
- 本知识库「大模型应用开发 / 流式输出与 SSE」「函数调用编排」章节。

## 八、面试题

- `temperature` 对生成确定性的影响？生产问答为何常设低温度？
- `max_tokens` 限制的是输入还是输出？截断如何处理？
- 为什么生产要配 timeout 与重试？不设会怎样？
- 如何在不改业务代码的前提下切换不同厂商模型？

## 九、演进与趋势

接口走向「OpenAI 兼容」事实标准；新增 `response_format`（JSON mode）、原生函数调用、流式思考（reasoning）；推理侧 vLLM/SGLang 提升吞吐与批处理；多模态（图/音/视频）统一进 messages；以及用量可观测与成本护栏成为 API 网关标配。

## 十、小结

大模型 API 调用是应用基石。理解消息角色与核心参数（temperature/max_tokens/stream/tools）、坚持 OpenAI 兼容以提升可移植性，并配齐超时、重试、密钥管理与流式，才能在工程上稳健可用。
