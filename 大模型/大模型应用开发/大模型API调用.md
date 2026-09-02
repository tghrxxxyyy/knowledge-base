# 大模型 API 调用

> 对应 datawhalechina/llm-universe「如何使用大模型 API」。掌握 API 是应用开发第一步。

## 一、核心概念

主流调用方式：OpenAI 兼容 `/v1/chat/completions`、各厂商 SDK、开源模型本地推理(vLLM OpenAI 兼容)。关键参数：

- `model`：模型名。
- `messages`：角色列表(system/user/assistant)。
- `temperature`：采样温度(0 确定性~2 随机)。
- `max_tokens`：最大生成长度。
- `stream`：是否流式。
- `tools`：工具定义(见工具调用文档)。

## 二、代码实现

```python
from openai import OpenAI
client = OpenAI(api_key="sk-...", base_url="https://api.openai.com/v1")
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role":"system","content":"你是助手"},
              {"role":"user","content":"用一句话解释RAG"}],
    temperature=0.3, max_tokens=200)
print(resp.choices[0].message.content)
```

## 三、关键要点

| 参数 | 建议 |
|------|------|
| temperature | 创作高/严谨低 |
| max_tokens | 防截断 |
| stream | 提升体感 |
| timeout | 防挂起 |

## 四、常见误区

- 把 system 与 user 混用，弱化系统指令。
- 忽略重试与超时，线上易雪崩。

## 五、与开源书的对应

- llm-universe「如何使用大模型 API」：https://datawhalechina.github.io/llm-universe/

## 七、面试题

- temperature 对生成确定性的影响？生产问答为何常设低温度？
