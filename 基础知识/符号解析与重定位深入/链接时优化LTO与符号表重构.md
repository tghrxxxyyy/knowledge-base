# 链接时优化LTO与符号表重构

> 对应 Aho, Sethi & Ullman《Compilers: Principles, Techniques, and Tools》第 8 章（优化）；CSAPP 第 7 章。

## 一、背景与挑战
单文件编译下，跨函数内联、过程间常量传播受翻译单元边界限制。把目标文件存成 LLVM bitcode，链接期可重建整个程序 IR 再优化。

## 二、核心原理
-flavour-lto 让编译器把 IR 而非机器码写入 .o（节名 .llvm.lto）。链接器收集所有 IR，拼成模块，跑内联、去虚函数、死函数消除，最后统一生成机器码并做传统链接。

## 三、形式化与数学基础
过程间可达函数集：
$$R = fixpoint(\lambda X.\ \bigcup_{f\in X} callees(f))$$
死函数即 $F \setminus R$，在 LTO 中可直接删除，缩小镜像并删除其符号。

## 四、代码实现
```bash
clang -flto -O2 a.c b.c -o app   # 全程 bitcode
# 链接器内部：合并 IR -> 优化 -> CodeGen
# 查看 bitcode
llvm-dis a.o -o - | head
```

## 五、与其他技术对比
LTO 突破 TU 边界实现全局优化，代价是链接期 CPU/内存暴涨； ThinLTO 用摘要并行化，平衡收益与开销。

## 六、常见误区
1. 混用 lto 与非 lto 目标——链接器退回传统模式，优化失效。
2. 以为 LTO 一定更快——小项目链接开销可能压倒收益。
3. 内联导致栈回溯困难，需保留调试段。

## 七、与开源书/权威来源对应
龙书 ch8 讲过程间分析；LLVM 文档讲 ThinLTO；CSAPP 7 章背景。

## 八、面试题
问：LTO 原理？ThinLTO 解决什么问题？为何 LTO 能删死函数？

## 九、演进与趋势
Modular LTO、WFMO（whole program devirtualization）使 C++ 模板膨胀显著收敛。

## 十、小结
LTO 把链接器变成二次编译后端，以时间为代价换取跨模块全局优化。
