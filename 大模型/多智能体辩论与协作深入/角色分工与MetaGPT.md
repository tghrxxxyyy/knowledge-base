# 角色分工与MetaGPT

> 对应 Hong et al., *MetaGPT: Meta Programming for Multi-Agent Collaborative Framework*, ICLR 2024；Wu et al., *AutoGen*, 2023。

## 一、背景与挑战

自由对话式多智能体在长任务中容易发散、重复讨论、责任不清。
把人类组织中的标准作业流程（SOP）引入多智能体，是把不确定的自由讨论约束成可追踪流水线的思路。

## 二、核心原理

- 角色化：产品、架构、工程、测试等角色各有专属提示、可用工具与产出物规范，减少职责重叠。
- 结构化中间产物：角色间交付的是文档/接口定义/测试用例等结构化工件，而非闲聊文本，降低信息损耗与歧义。
- 共享工作区（发布订阅式消息池）：角色按需订阅相关工件，避免全量广播造成上下文膨胀。

## 三、数学形式

自由广播的通信量为 $O(m^2 T)$（$m$ 角色、$T$ 轮），SOP 加订阅把它降到 $O(|E| T)$，$|E|$ 为角色依赖图的边数。

若依赖图近似链式，$|E|\approx m$，通信复杂度由二次降为线性，这是结构化协作可扩展的关键。

## 四、代码实现

```python
class Role:
    def __init__(self, name, prompt, subscribe):
        self.name, self.prompt, self.subscribe = name, prompt, subscribe
    def act(self, board, llm):
        ctx = [w for w in board if w.kind in self.subscribe]
        return llm(self.prompt + render(ctx))

def run_team(roles, board, llm, rounds=2):
    for _ in range(rounds):
        for r in roles:                       # 按 SOP 顺序推进
            board.append(r.act(board, llm))
    return board
```

## 五、与其他对比

- 与辩论式协作：辩论求正确性，分工求可交付性与规模化；复杂工程任务常用分工为骨架、局部插入评审辩论。
- 与传统工作流引擎：SOP 提供可控性，LLM 提供每步的语义灵活性，二者互补。

## 六、常见误区

- 角色设太多导致沟通开销超过分工收益，工件在链路中层层失真。
- 工件格式不受约束（自由文本），下游角色需重新理解，等于没有结构化。
- 缺少验收关卡：没有测试角色或验收标准时，错误会一路传到最后。

## 七、与开源书对应

- datawhalechina/llm-universe（多 Agent 与应用架构实践）：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course（LLM 应用工程与 Agent 框架）：https://github.com/mlabonne/llm-course

## 八、面试题

- 结构化工件为什么比自由对话更可靠？答：它把角色接口显式化，可校验、可复用、可回溯，减少歧义传播与上下文膨胀。
- 角色数量如何确定？答：以依赖图边数与验收关卡为准，边际收益低于通信与失真成本时停止拆分。

## 九、演进

单体 Agent → 自由多智能体对话 → SOP 角色分工（MetaGPT）→ 可编程会话与工具化框架（AutoGen）→ 带质量门的工程化流水线。

## 十、小结

角色分工用组织学思路治理复杂度：显式接口、结构化工件、必要的验收关卡。
