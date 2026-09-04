# LLM 应用可观测性基础

> 对应 vllm-project/vllm 与 huggingface/transformers。

## 一、背景与挑战
生产 LLM 链路含检索、插件、多模型调用，问题定位困难，需要端到端可观测。

## 二、核心原理
把每次请求拆成带上下文的调用链，记录耗时、token、错误，实现分布式追踪。

## 三、形式化与数学基础
端到端时延分解：
$ T = \sum_{s \in \mathrm{span}} t_s + \sum_{e} \text{queue}_e $

## 四、代码实现
```python
def trace(req):
    with span('retrieve') as s:
        s.set_attr('docs', 5)
        return do_retrieve(req)
```

## 五、与其他技术对比
日志只能看单点，追踪给出因果链路与瓶颈。

## 六、常见误区
只记录总时延不钻取子 span；遗漏异步调用。

## 七、与开源书/权威来源对应
vllm-project/vllm 提供服务可观测钩子；huggingface/transformers 提供执行钩子。

## 八、面试题
为何 LLM 应用需要比传统服务更细的追踪？

## 九、演进与趋势
语义级追踪把提示与中间态纳入。

## 十、小结
可观测性是 LLM 应用可靠运维的底座。
