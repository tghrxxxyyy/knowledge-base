# API网关总览

> 对应 API 网关（Kong/Envoy/NGINX）；LLM 网关实践。

## 一、背景与挑战

多模型/多租户需统一入口做认证、路由、限流、观测，避免每个服务各自实现。

## 二、核心原理

网关处拦截：认证（key/OAuth）→ 路由（模型/版本）→ 限流 → 配额 → 日志；下游接推理服务。

## 三、数学形式

路由函数 $r = f(api\_key, model, path)$；命中后端集 $S_r$。

## 四、代码实现

```python
# Kong 插件式路由（伪）
route: /v1/chat -> service: vllm-prod, plugin: rate-limiting
```

## 五、与其他对比

- 与 模型服务负载均衡深入（下游分发）衔接。
- 与 推理缓存与命中优化深入（网关层缓存）互补。

## 六、常见误区

- 把重逻辑塞网关致瓶颈。
- 忽略网关自身限流精度（分布式计数）。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 网关职责？答：统一认证/路由/限流/观测，下游专注推理。

## 九、演进

直连 → 反向代理 → 插件化网关 → LLM 专用网关。

## 十、小结

API 网关是 LLM 服务统一入口，解耦横切关注点。
