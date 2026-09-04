# NFA与DFA

> 对应 龙书 与 Crafting Interpreters。

## 一、背景与挑战
不确定有限自动机 (NFA) 状态转移可有多条、可有 $\epsilon$ 转移；确定性 (DFA) 每状态对每个输入唯一转移。挑战：NFA 易于由正则构造，但匹配需模拟多状态；DFA 匹配快但不易直接构造且状态数可能指数膨胀。

## 二、核心原理
自动机 $M=(Q,\Sigma,\delta,q_0,F)$。NFA 的 $\delta:Q\times(\Sigma\cup\{\epsilon\})\to 2^Q$；DFA 的 $\delta:Q\times\Sigma\to Q$ 为单值函数。接受 iff 存在一条从 $q_0$ 到某 $f\in F$ 的路径消费完输入。

## 三、形式化 / 数学基础
NFA 的 $\epsilon$-闭包定义：
$\text{EPS}(S)=\{q\mid \exists p\in S,\ q\text{ 可达仅经 }\epsilon\text{ 边}\}$。
扩展转移：$\hat\delta(S,a)=\text{EPS}\big(\bigcup_{p\in S}\delta(p,a)\big)$。
DFA 等价判定：两 DFA 等价当且仅当它们的最小 DFA 同构。

## 四、代码实现
```python
def eps_closure(states, eps):
    stack = list(states); clos = set(states)
    while stack:
        s = stack.pop()
        for t in eps.get(s, ()):
            if t not in clos:
                clos.add(t); stack.append(t)
    return clos
```

## 五、与其他技术对比
- NFA：构造简单（Thompson），匹配需维护状态集。
- DFA：匹配 $O(n)$ 单状态、查表极快，但构造可能指数状态。
- 表驱动 vs 直接编码转移（龙书 3.6 节"预计算"两种风格）。

## 六、常见误区
1. 以为 NFA 必须"同时处在多个状态"——只是状态集模拟。
2. 忽略 $\epsilon$ 闭包导致模拟错误。
3. 认为 DFA 一定比 NFA 小——可能指数倍大。

## 七、与开源书 / 权威来源对应
- Crafting Interpreters: https://github.com/munificent/craftinginterpreters （扫描器章）
- 龙书 Aho et al. 第 3.6-3.7 节
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
- 为什么 DFA 匹配是线性时间？
- NFA 转 DFA 后状态数最坏增长多少？
- 如何做"两正则语言等价"判定？

## 九、演进与趋势
现代词法器常直接生成 DFA 表（lex/flex）；浏览器引擎用紧凑表与跳跃优化；Unicode 使状态表体积成为工程难点。

## 十、小结
NFA 与 DFA 是正则匹配的两种视图：前者构造自然、后者执行高效；子集构造架起桥梁，最小化为工程优化终点。
