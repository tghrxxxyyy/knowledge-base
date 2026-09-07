# 栈式机器到寄存器机器Lowering

> 对应 Aho 等《Compilers》第 6、8 章；Appel《Modern Compiler Implementation》第 8 章。

## 一、背景与挑战
JVM 字节码等栈式 IR 以操作数栈表达计算，而物理 CPU 是寄存器架构。需把隐式栈操作 lowering 为显式寄存器分配与数据移动。

## 二、核心原理
栈式求值（a=b+c）对应 push b; push c; add。Lowering 把栈槽映射为虚拟寄存器，连续 pop/push 转为寄存器间 move 或直接操作数。再经寄存器分配与调度生成机器码。关键是指出栈槽生命周期以便合并。

## 三、形式化与数学基础
栈操作转为三地址：
$$push\ x \to t_i = x;\quad add \to t_k = t_i + t_j$$
栈深度约束保证类型正确：任意点 $\sum arity = depth$。虚拟寄存器数 $\le$ 最大栈深。

## 四、代码实现
```python
# 栈式到三地址
def lower(instrs):
    stack = []
    for i in instrs:
        if i.op == 'push': stack.append(i.val)
        elif i.op == 'add':
            b, a = stack.pop(), stack.pop()
            t = new_tmp(); emit(f"{t} = {a} + {b}")
            stack.append(t)
```

## 五、与其他技术对比
栈式 IR 紧凑、与架构无关、易验证；寄存器 IR 更贴近执行、利于优化；现代 JVM 经 JIT 直接 lowering 到寄存器机器。

## 六、常见误区
1. 一对一翻译 push/pop 致大量冗余 move。
2. 忽略栈槽类型致 lowering 丢失信息。
3. 未合并同生命周期栈槽浪费寄存器。

## 七、与开源书/权威来源对应
龙书 ch6（栈式）；Appel ch8（lowering）；JVM 规范；munificent/craftinginterpreters。

## 八、面试题
问：栈式如何转寄存器？最大寄存器数？为何 JVM 用栈式？

## 九、演进与趋势
GraalVM 把字节码直接图化做高级优化；WebAssembly 栈式但易译到寄存器。

## 十、小结
Lowering 把隐式栈语义显式化为寄存器操作，是跨架构代码生成的关键转换。
