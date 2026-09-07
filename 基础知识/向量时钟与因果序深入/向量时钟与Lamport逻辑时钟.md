# 向量时钟与Lamport逻辑时钟

> 对应 Lamport 1978（Time, Clocks, and the Ordering of Events in a Distributed System）。

## 一、背景与挑战
Lamport 在 1978 年提出用标量逻辑时钟给事件定序，但它只能保证“若 a→b 则 C(a)<C(b)”，反向不成立（可能 C(a)<C(b) 但 a 与 b 并发）。向量时钟补足了这一短板。

## 二、核心原理
- Lamport 时钟：每个事件递增本地计数器，收到消息取 max+1。
- 问题：计数器值大不代表因果在前。
- 向量时钟：每维记录对各节点的已知最大计数，可判定因果与并发。

## 三、形式化与数学基础
Lamport 时钟满足单调性 $C(a) < C(b) \Rightarrow a \to b$，但逆命题假。向量时钟满足：
$a \to b \iff V_a < V_b$（分量偏序），从而可双向判定（含并发检测）。

## 四、代码实现
# Lamport 时钟
def lamport(on_recv, msg, i, C):
    if on_recv:
        C[i] = max(C[i], msg.c) + 1
    else:
        C[i] += 1

## 五、与其他技术对比
| 时钟 | 空间 | 能判并发 |
| Lamport | O(1) | 否 |
| 向量 | O(N) | 是 |

## 六、常见误区
1. 用 Lamport 时钟值大小反推因果。
2. 以为向量时钟总是优于标量（空间代价）。

## 七、与开源书/权威来源对应
- Lamport 1978。
- Kleppmann, DDIA, Ch.8（顺序保证）。
- Coulouris, Distributed Systems。

## 八、面试题
1. 为什么 Lamport 时钟不能判定并发？
2. 向量时钟空间代价是多少？

## 九、演进与趋势
紧凑向量时钟（如 interval tree clocks）降低空间。

## 十、小结
标量时钟给全序，向量时钟给因果序，二者互补。
