# 优先级队列与 SLA 保障

> 对应 Kwon 2023 vLLM; Ouyang 2022 InstructGPT; Zhao 2023 FSDP。

## 一、背景与挑战
付费/高优请求需优先满足延迟 SLA，不能与低优请求平等排队。

## 二、核心原理
网关/调度按优先级入不同队列，高优先调度、可抢占低优 KV；配额隔离防止低优饿死，并设每级最大并发。

## 三、形式化与数学基础
加权优先级调度，高优权重 w_h >> w_l。长期获得份额：
$ s_i = \frac{w_i}{\sum w_j} C $
辅以优先级抢占保证 p99 延迟。

## 四、代码实现
```python
def schedule(queues):
    for q in sorted(queues, key=lambda q: -q.priority):
        if q and has_slot(q.tenant):
            return q.pop()
```

## 五、与其他技术对比
FIFO 公平但无 SLA；优先级保障关键业务，需配额防饿死。

## 六、常见误区
误区：高优永不排队。仍受显存/批上限约束，需配额兜底。

## 七、与开源书/权威来源对应
vLLM 优先级调度；云服务 SLA 实践。见 vllm-project/vllm。

## 八、面试题
问：优先级如何不饿死低优？
答：设最低份额配额与老化机制，保证长期公平。

## 九、演进与趋势
基于强化学习的动态优先级调整。

## 十、小结
优先级+配额在保障 SLA 与公平间取得平衡。
