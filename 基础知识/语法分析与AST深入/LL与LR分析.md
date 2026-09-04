# LL与LR分析

> 对应 龙书 第 4-4.7 章。

## 一、背景与挑战
LL 自顶向下、LR 自底向上是两类主要表驱动解析。挑战：LL 需无左递归的文法；LR 更强（覆盖更多 CFG）但表构造复杂（SLR/LALR/Canonical LR）。

## 二、核心原理
LL(k)：从左读、最左推导、看 k 个符号。LR：从左读、最右推导逆序（规约）、用状态栈 + 分析表。项 (item) 是带点的产生式，LR 状态 = 项集闭包。

## 三、形式化 / 数学基础
LR(0) 项：$A\to\alpha\cdot\beta$。移进/规约动作由项集决定。LALR 用向前看符合并 LR(1) 状态减少表规模。冲突：移进-规约、规约-规约。

## 四、代码实现
```python
# 极简 LR 驱动循环骨架
def lr_parse(tokens, action, goto):
    st = [0]; sy = []
    i = 0
    while True:
        a = tokens[i]
        op, x = action[st[-1]][a.kind]
        if op == "shift":
            st.append(x); sy.append(a); i += 1
        elif op == "reduce":
            lhs, n = x
            sy[-n:] = [Node(lhs, sy[-n:])]
            st[-n:] = [goto[st[-n-1]][lhs]]
        else:
            return sy[-1]
```

## 五、与其他技术对比
- LL(1)（递归下降/ANTLR）：易手写、错误清楚，文法受限。
- SLR：构造简单但有冲突；LALR（yacc/bison）：实用主流；LR(1)：无冲突但表大。

## 六、常见误区
1. 以为 LR 能解析任何 CFG——仍有二义/冲突文法。
2. 混淆移进-规约冲突与文法二义。
3. 在 yacc 中忘记 %left/%right 声明优先级。

## 七、与开源书 / 权威来源对应
- 龙书 Aho et al. 第 4.3-4.7 节
- Appel《Modern Compiler Implementation》第 3 章
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
- LL 与 LR 最大区别？谁覆盖文法更多？
- 什么是移进-规约冲突？如何消解？
- SLR / LALR / LR(1) 有何不同？

## 九、演进与趋势
GLR 处理二义文法（自然语言/ C++）；增量解析（IDE）；基于项的并行解析。

## 十、小结
LL 简单、LR 强大；理解项、闭包、FOLLOW 集合与冲突类型是掌握自动解析器的核心。
