# Gossip的流行病传播模型

> 对应 Demers et al. 1987（Epidemic Algorithms for Replicated Database Maintenance，gossip 经典论文）与 Kleppmann DDIA 第8章。

## 一、背景与挑战
Gossip 的理论基础是流行病（epidemic）模型。把一次状态更新视为“病毒”，节点视为“宿主”，研究更新在多轮随机传播下的覆盖率与收敛时间。

## 二、核心原理
- 易感染（Susceptible）：尚无更新。
- 已感染（Infected）：持有更新并继续传播。
- 已恢复（Removed）：停止传播（仅用于某些变体）。
传播过程即“感染”在节点间扩散。

## 三、形式化与数学基础
经典 SI 模型：设感染比例 x，单轮每节点联系 c 个邻居，则：
$\frac{dx}{dt} = c x (1 - x)$
解得 $x(t) = \frac{1}{1 + e^{-ct}}$，即 logistic 曲线，t 较大时趋近 1。

## 四、代码实现
# SI 模型数值模拟
def simulate(n, c, rounds):
    infected = 1
    for _ in range(rounds):
        # 每轮新增约 c * 已感染 * 未感染
        new = int(c * infected * (n - infected) / n)
        infected = min(n, infected + new)
    return infected / n

## 五、与其他技术对比
- 对比确定性广播：流行病模型以概率保证覆盖，冗余但稳健。
- 对比 BFS 传播：gossip 不依赖树结构，容忍动态拓扑。

## 六、常见误区
1. 忽略 c 过小时收敛极慢。
2. 把理论覆盖率直接等同于实际延时。

## 七、与开源书/权威来源对应
- Demers et al. 1987, Epidemic Algorithms。
- Kleppmann, DDIA, Ch.8。
- mit-pdos/6.824 对 gossip 的作业讨论。

## 八、面试题
1. 为什么 gossip 收敛是 logistic 而非线性？
2. 如何让覆盖率在固定时间内达到 (1-ε)？

## 九、演进与趋势
把流行病模型扩展到多值、带权重传播，用于边缘计算与联邦学习。

## 十、小结
流行病模型为 gossip 的可扩展性提供了严格的数学解释。
