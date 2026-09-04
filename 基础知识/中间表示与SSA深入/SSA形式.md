# SSA形式

> 对应 龙书 第 9 章 与 Appel 第 10 章（SSA）。

## 一、背景与挑战
静态单赋值 (SSA) 要求每个变量仅被赋值一次，合并点用 $\phi$ 函数选值。挑战：构建/销毁 SSA 的开销、正确放置 $\phi$、与优化交互。

## 二、核心原理
每个定义有唯一名 `x1, x2...`；在控制汇合处插入 `x3 = phi(x1, x2)` 表示"依前驱选值"。SSA 让use-def 链直接可得，极大简化数据流分析。

## 三、形式化 / 数学基础
$\phi$ 语义：在块 $B$ 有多个前驱 $p_1..p_k$，`x = phi(x_p1,...,x_pk)` 取"来自前驱 $p_i$ 的版本"。放置准则：在每个支配边界 (dominance frontier) 插入 $\phi$。

## 四、代码实现
```python
# SSA 片断（伪 IR）
y1 = 1
if c:
    y2 = 2
else:
    y3 = 3
y4 = phi(y2, y3)   # 依前驱选择
print(y4)
```

## 五、与其他技术对比
- SSA：use-def 精确、优化强（GVN/常量传播）；需 $\phi$ 管理。
- 非 SSA：寄存器式，需迭代数据流；LLVM 内部用 SSA 风格 IR。
- 内存 SSA：把指针别名也纳入 SSA（更难）。

## 六、常见误区
1. 在错误汇合点漏插 $\phi$ 致使用错版本。
2. 以为 $\phi$ 是运行期指令（它是静态选择）。
3. 销毁 SSA 时寄存器分配不当。

## 七、与开源书 / 权威来源对应
- 龙书 Aho et al. 第 9 章
- Appel《Modern Compiler Implementation》第 10 章
- Kennedy & Allen《Optimizing Compilers for Modern Architectures》

## 八、面试题
- 为什么 SSA 利于优化？
- 支配边界 (dominance frontier) 如何决定 $\phi$ 位置？
- $\phi$ 函数运行期做什么？

## 九、演进与趋势
partial-SSA、内存 SSA、以及 GPU/向量化中的 SSA 扩展。

## 十、小结
SSA 以"每变量一次定义 + $\phi$" 换取精确的 def-use；是现代优化器的标配中间形态。
