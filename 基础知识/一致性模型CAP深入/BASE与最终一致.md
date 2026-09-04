# BASE与最终一致

> 对应《BASE: An Acid Alternative》(Pritchett, 2008, ACM Queue) 与 Dynamo 设计。

## 一、背景与挑战
ACID 强调强一致与隔离，代价是高延迟与低可用。互联网高并发场景(购物车、动态流)可接受短暂不一致以换取可用性与分区容忍，由此提出 BASE 与最终一致性。

## 二、核心原理
BASE = Basically Available(基本可用) + Soft state(软状态，副本间可暂时不一致) + Eventually consistent(最终一致)。
最终一致：若停止写入，系统经过有限时间后所有副本收敛到同一值。常见变体：因果一致、读己之写、单调读、会话一致、单调写。

## 三、形式化 / 数学基础
收敛定义：设副本值集合 S(t)，写入停止时刻 t0，存在 t1 使对所有 t>=t1，所有副本值相等。
最终一致要求：lim_{t->∞} variance(S(t)) = 0（用词类比，非严格）。
反熵(anti-entropy)：副本间通过 Merkle 树比对差异并修复，保证收敛。

## 四、代码实现
```python
# 最终一致写：异步复制 + 版本向量
class Replica:
    def __init__(self, id):
        self.ver = {id: 0}
        self.val = None
    def merge(self, other_val, other_ver):
        # 取版本向量更大的；并发则应用CRDT合并
        if dominates(other_ver, self.ver):
            self.val, self.ver = other_val, other_ver
```

## 五、与其他技术对比
- ACID 优先一致性，BASE 优先可用性。
- 最终一致是弱一致的一种，需应用层容忍临时不一致。

## 六、常见误区
- 误区：最终一致会“永远不一致”。定义要求必然收敛。
- 误区：BASE 等于无一致性。只是延迟一致。

## 七、与开源书 / 权威来源对应
- Pritchett《BASE: An Acid Alternative》(2008)。
- DeCandia et al.《Dynamo》(SOSP 2007)。
- DDIA 中文: https://github.com/Vonng/ddia

## 八、面试题
1. BASE 三字母含义？与 ACID 关系？
2. 最终一致有哪些常见客户端可感知的变体？
3. 如何保证最终一致系统必然收敛？

## 九、演进与趋势
CRDT、无冲突合并、可调节一致性级别让 BASE 系统更易用且可控。

## 十、小结
BASE 与最终一致以“延迟一致”换取高可用与分区容忍，是现代大规模 AP 系统的基石。
