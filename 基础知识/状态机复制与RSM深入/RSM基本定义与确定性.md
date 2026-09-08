# RSM基本定义与确定性

> 对应 Lamport 1978（Time, Clocks and Ordering）与 Ongaro & Ousterhout 2014（Raft）。

## 一、背景与挑战
如何让多台机器表现得像一台始终可用的机器？状态机复制（Replicated State Machine, RSM）的答案是：所有副本从同一初始状态出发，以相同顺序执行相同命令，则必然得到相同状态。前提是「命令执行确定性」。

## 二、核心原理
RSM 核心是：给定相同状态 S 与命令 C，转移函数 \\(\delta(S,C)\\) 必须确定且对所有副本一致。只要日志（命令序列）在副本间一致有序，各副本独立重放即得一致状态，无需互相拷贝状态。

## 三、形式化与数学基础
定义状态转移 \\(\delta: State \times Command \to State\\)。若副本日志 \\(\vec C = (C_1,\dots,C_n)\\) 一致，则
\\[
S_n = \delta(\dots\delta(\delta(S_0, C_1), C_2)\dots, C_n)
\\]
对所有副本相同。确定性要求 \\(\delta\\) 无未定义行为、无随机、无未排序并发。

## 四、代码实现
```python
class RSM:
    def __init__(self): self.state = {}
    def apply(self, cmd):
        # 必须确定性：不依赖字典遍历序、时间、随机
        if cmd.op == "SET":
            self.state[cmd.key] = cmd.val
        elif cmd.op == "INC":
            self.state[cmd.key] = self.state.get(cmd.key, 0) + cmd.val
```

## 五、与其他技术对比
主从异步复制不保证日志一致（可能丢）；RSM 通过共识保证日志一致有序，属强一致复制。状态机复制 vs 状态转移：前者重放命令，后者传状态差异。

## 六、常见误区
1. 用随机或时间参与状态转移：破坏确定性，副本分裂。
2. 依赖语言无关细节（浮点、map 遍历序）：跨语言或版本不一致。
3. 认为日志一致即状态一致：还需确定性 apply。

## 七、与开源书/权威来源对应
Lamport 1978 提出状态机方法；Raft 论文将 RSM 作为核心抽象；6.824 以此组织 Lab。

## 八、面试题
问：RSM 为何要求确定性？
答：只有确定性转移才保证「同序命令到同状态」，否则副本分裂。

## 九、演进与趋势
确定性数据库（如 Calvin、Fauna）把整个事务调度做成确定性状态机，简化复制。

## 十、小结
RSM 以「同序加确定性」换取多副本一致，是强一致复制的理论内核。
