# 栈式与寄存器式VM

> 对应 Crafting Interpreters（clox 栈式）与 Lua 5 寄存器式 VM。

## 一、背景与挑战
VM 操作数存放方式分栈式（隐式操作数栈）与寄存器式（显式寄存器/局部变量数组）。挑战：dispatch 次数、内存访问、代码密度、JIT 友好度。

## 二、核心原理
栈式：`ADD` 从操作数栈弹两压一，指令短、无需指操作数。寄存器式：指令含寄存器索引 `ADD r3, r1, r2`，少压弹、少 dispatch，但指令更长。

## 三、形式化 / 数学基础
栈式状态含隐式栈 $S$；寄存器式状态含寄存器文件 $R[0..k]$。
同一 `a+b*c`：栈式需更多 push/pop（约 5 指令），寄存器式约 2-3。

## 四、代码实现
```lua
-- Lua 风格寄存器式: 指令直接引用寄存器槽
R[3] = R[1] + R[2] * R[4]   -- 一条复合指令即可
-- 对应栈式需 CONST/LOAD/MUL/ADD 多条
```

## 五、与其他技术对比
- 栈式：指令短、易生成、JIT 易映射；dispatch 多。
- 寄存器式：dispatch 少、局部性好；指令编码长、生成复杂。
- 二者都在真实引擎中广泛存在（JVM 栈式，Lua/ Dalvik 寄存器式）。

## 六、常见误区
1. 以为寄存器式一定更快（生成/解码成本上升）。
2. 混淆"CPU 寄存器"与"VM 寄存器"（后者是栈槽别名）。
3. 栈式弹栈顺序与结合性错配。

## 七、与开源书 / 权威来源对应
- Crafting Interpreters: https://github.com/munificent/craftinginterpreters （clox 栈式）
- CS-Notes: https://github.com/CyC2018/CS-Notes （Dalvik 寄存器式）
- SICP: https://github.com/sarabander/sicp-pdf

## 八、面试题
- 栈式与寄存器式 VM 取舍？
- 为什么 JVM 选栈式（可移植/验证）？
- Lua 为何选寄存器式？

## 九、演进与趋势
混合模型、寄存器式 VM 加 JIT、以及 WebAssembly 栈式抽象但底层映射寄存器。

## 十、小结
操作数存放方式决定 VM 性能画像：栈式易移植验证、寄存器式少 dispatch；二者是工程权衡而非优劣。
