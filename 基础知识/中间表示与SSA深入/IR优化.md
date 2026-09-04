# IR优化

> 对应 Kennedy & Allen 与 龙书 第 9-12 章。

## 一、背景与挑战
在 IR（尤其 SSA）上做与机器无关的优化：公共子表达式消除、死代码删除、常量折叠等。挑战：正确性、优化间交互、编译时间。

## 二、核心原理
数据流分析提供每个点的事实（可用表达式、活跃变量、常量）。基于事实重写 IR。幂等且可迭代至不动点。

## 三、形式化 / 数学基础
到达定义 (reaching definitions)： $IN[B]=\bigcup_{p\in pred(B)} OUT[p]$，
$OUT[B]=GEN[B]\cup(IN[B]-KILL[B])$。迭代至不动点即数据流解。

## 四、代码实现
```python
def dce(blocks):
    changed = True
    while changed:
        changed = False
        for b in blocks:
            for i in list(b):
                if i.is_dead() and not i.has_side_effect():
                    b.remove(i); changed = True
```

## 五、与其他技术对比
- 机器无关优化（IR 层）：可移植、易写。
- 机器相关优化（后端）：利用特殊指令。
- SSA 上优化：def-use 精确，强于迭代数据流。

## 六、常见误区
1. 删除"看似无用"但有副作用的调用。
2. 优化破坏 SSA 的单一赋值不变式。
3. 不动点迭代初值错致漏报。

## 七、与开源书 / 权威来源对应
- 龙书 Aho et al. 第 9-12 章
- Kennedy & Allen《Optimizing Compilers for Modern Architectures》
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
- 数据流分析不动点怎么求？
- 死代码删除为何需迭代？
- SSA 上优化相比传统优势？

## 九、演进与趋势
ML 驱动优化调度、超优化 (superoptimization)、以及贯穿多层的统一 IR。

## 十、小结
IR 优化建立在数据流分析之上：以不动点求解事实、以重写消除冗余；SSA 让 def-use 直接可得，是现代优化的主战场。
