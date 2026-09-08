# HLC基本结构与算法

> 对应 Kleppmann《Designing Data-Intensive Applications》及 HLC 原始论文（Kulkarni et al., 2014）。

## 一、背景与挑战
Lamport 逻辑时钟只保因果序、丢物理时间；物理时钟虽可排序但不可靠。混合逻辑时钟（Hybrid Logical Clock, HLC）把二者结合：既接近物理时间便于调试或超时，又保因果序且对时钟漂移有界。它要解决「在物理时钟不可靠时仍能给出全局可比较、且物理部分有界」的难题。

## 二、核心原理
HLC 是一个二元组 \\((l, c)\\)，其中 \\(l\\) 是物理部分（通常取本地墙上时钟毫秒），\\(c\\) 是计数器。事件处理时：若本地物理时间 \\(pt\\) 大于 \\(l\\)，则 \\(l=pt, c=0\\)；否则 \\(l\\) 不变且 \\(c\\) 递增；当收到消息时取 \\(\max\\) 并相应调整计数器。

## 三、形式化与数学基础
算法（发送或本地事件）：
```
l' = max(l, pt)
c' = (l' == l) ? c+1 : 0
```
收到消息 \\(m=(l_m,c_m)\\)：
```
l' = max(l, l_m, pt)
if l'==l==l_m: c' = max(c,c_m)+1
elif l'==l:    c' = c+1
elif l'==l_m:  c' = c_m+1
else:          c' = 0
```
可证 \\(|l - pt| \le \epsilon\\)（\\(\epsilon\\) 为时钟误差上界），且 \\((l,c)\\) 全序可比。

## 四、代码实现
```python
import time
EPS = 50  # ms 误差上界

def tick(l, c, pt=None):
    pt = int(time.time()*1000) if pt is None else pt
    if pt > l:
        return pt, 0
    return l, c + 1

def recv(l, c, lm, cm, pt=None):
    pt = int(time.time()*1000) if pt is None else pt
    l_new = max(l, lm, pt)
    if l_new == l == lm:
        c_new = max(c, cm) + 1
    elif l_new == l:
        c_new = c + 1
    elif l_new == lm:
        c_new = cm + 1
    else:
        c_new = 0
    return l_new, c_new
```

## 五、与其他技术对比
Lamport 时钟只有计数器、无物理含义；向量时钟可判因果但空间随节点数线性增长；HLC 单值近似物理时间且空间 O(1)。TrueTime 给区间而非单点。

## 六、常见误区
1. 认为 HLC 等于物理时间：物理部分有界但不精确。
2. 忽略 \\(\epsilon\\) 配置：误差界需与实际 NTP 精度匹配。
3. 把 HLC 当向量时钟用判因果：HLC 不完全编码因果集。

## 七、与开源书/权威来源对应
Kulkarni 等人 2014 年论文给出严格证明；CockroachDB 用 HLC 做 MVCC 时间戳；DDIA 在第8章讨论逻辑与物理时钟的取舍。

## 八、面试题
问：HLC 的物理部分如何保证有界？
答：每次事件都取物理时间与当前值的最大值，物理部分不会落后真实时间超过时钟误差上界 \\(\epsilon\\)。

## 九、演进与趋势
HLC 已用于 Spanner 之外的多家 NewSQL；变体如「带容错的 HLC」在云原生数据库普及。

## 十、小结
HLC 用 O(1) 空间兼顾因果序与近似物理时间，是分布式事务时间戳的实用方案。
