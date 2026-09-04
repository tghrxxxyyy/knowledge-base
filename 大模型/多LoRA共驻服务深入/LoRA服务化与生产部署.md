# LoRA服务化与生产部署

> 对应 Hu 2021 LoRA; huggingface/peft; Ouyang 2022 InstructGPT。

## 一、背景与挑战
把多LoRA能力暴露为 API，需要鉴权、路由、限流与版本管理，避免租户误用彼此适配器。

## 二、核心原理
网关按 API key 解析 tenant→adapter_id，下发请求时携带标识；服务层校验权限、加载权重、计费用适配器维度。

## 三、形式化与数学基础
请求元组 r=(tenant, adapter_id, x)。校验：
$ \text{allow} = (adapter\_id \in \text{granted}(tenant)) \land \text{quota\_ok}(tenant) $

## 四、代码实现
```python
def handle(req):
    if req.adapter not in tenant_grants[req.tenant]:
        raise PermissionError
    adapter = ensure_adapter(cache, req.adapter)
    return model.generate(req.x, adapter)
```

## 五、与其他技术对比
独立模型部署无共享红利；LoRA 服务化复用基座，运维与成本更优。

## 六、常见误区
误区：adapter_id 公开即安全。需租户级授权，防止越权调用他者适配器。

## 七、与开源书/权威来源对应
PEFT + vLLM 多 LoRA 服务；参考 huggingface/peft。

## 八、面试题
问：如何隔离租户适配器并计费？
答：网关鉴权绑定 adapter_id，按调用量计费用，物理共享基座。

## 九、演进与趋势
适配器市场与按需计费成为平台能力。

## 十、小结
LoRA 服务化把微调能力变成可计量、可隔离的 API 资源。
