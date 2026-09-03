# 基于Token的限流

> 对应 OpenAI, *API Rate Limits & Usage Tiers*（按 token 计费与限流）；与 网关限流深入 衔接。

## 一、背景与挑战

LLM 成本以 token 计，QPS 无法反映真实资源，需按 token 限流。

## 二、核心原理

以 prompt+completion token 数为 cost 入令牌桶；并用 tiktoken 预估 prompt token 先扣，再按实际补偿。

## 三、数学形式

预估 $\hat n=\text{tiktoken}(prompt)$；实际扣减 $\Delta = n_{real}-\hat n$；桶余额 $B\ge \hat n$ 才放行。

## 四、代码实现

```python
n = tokenizer.encode(prompt).__len__()
if not token_limiter.allow(user, cost=n):
    return 429
```

## 五、与其他对比

- 与 令牌桶与漏桶（cost 即 token 数）是直接应用。
- 与 网关限流深入（多维限流之一）组成。

## 六、常见误区

- 仅按 prompt token 忽略生成可能超长。
- 预估不准致桶提前耗尽或超发。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 为何按 token 限流？答：LLM 成本与资源消耗由 token 决定，QPS 不能反映真实开销。

## 九、演进

QPS → 请求+token 双限 → 动态预算。

## 十、小结

token 级限流贴合 LLM 计费模型，是成本护栏核心。
