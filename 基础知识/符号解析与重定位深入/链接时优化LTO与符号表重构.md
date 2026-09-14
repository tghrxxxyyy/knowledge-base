# 链接时优化LTO与符号表重构

> 对应 Aho、Sethi & Ullman《Compilers: Principles, Techniques, and Tools》（龙书）第 8 章（过程间优化）；CSAPP 第 7 章；并参考 LLVM 文档 ThinLTO 与 GCC 手册 `-flto`。

## 一、背景与挑战

单文件编译下，跨函数内联、过程间常量传播、死函数消除都受翻译单元（TU）边界限制：编译器只看到一个 `.c`，看不到别的 TU 的被调函数体。

这导致大量本可内联/消除的调用残留，镜像膨胀、间接调用无法去虚化。

链接时间优化（LTO）把目标文件存成编译器 IR（而非机器码），让链接器在「链接期」重建整个程序的 IR，再做全局优化，最后统一生成机器码。

代价是链接期 CPU/内存暴涨，且调试与增量构建更复杂。

## 二、核心原理

`-flto` 让编译器把 LLVM bitcode / GCC GIMPLE 写入 `.o` 的特殊节（如 `.llvm.lto`、`.gnu.lto_*`），而非（或连同）机器码。

链接器通过「链接器插件」（如 `LLVMgold.so`、LLD 内建）收集所有 IR，拼成单一模块，跑过程间优化：内联、去虚函数、常量传播、死函数消除，最后统一 CodeGen 并做传统链接。

ThinLTO 不合并成单一大模块，而是先跑轻量「摘要（summary）」做跨模块导入决策，再并行优化各模块，平衡收益与开销。

LTO 还重构符号表：被内联/消除的函数从导出符号中消失，COMDAT 重复定义被合并。

## 三、形式化与数学基础

过程间可达函数集是调用图的不动点：

$$R = fixpoint(\lambda X.\ \{main\} \cup \bigcup_{f\in X} callees(f))$$

死函数即 $F \setminus R$，在 LTO 中可直接删除，缩小镜像并删除其符号。

跨模块内联需导入被调函数体：

$$Inline(f,g) \Rightarrow body(g)\ \text{嵌入}\ caller(f)$$

摘要阶段用 `import_list(g)` 决定哪些函数体需跨模块搬运。

## 四、代码实现

```bash
# 全程 bitcode，链接器内部优化后再 CodeGen
clang -flto -O2 -c a.c b.c
clang -flto -O2 a.o b.o -o app

# ThinLTO：并行、低内存
clang -flto=thin -O2 -c a.c b.c
clang -flto=thin -O2 a.o b.o -o app

# 查看 bitcode（LLVM）
llvm-dis a.o -o - | head
```

GCC 对应 `-flto=[N]`（`N` 为并行流数量）；LLD 对 ThinLTO 有原生支持，无需外部插件。

## 五、与其他技术对比

| 方案 | 跨 TU 优化 | 链接开销 | 内存 |
| --- | --- | --- | --- |
| 无 LTO | 否 | 低 | 低 |
| 全量 LTO | 是 | 高 | 高 |
| ThinLTO | 是（摘要引导） | 中 | 中 |
| 单 TU 内联 | 仅本文件 | 低 | 低 |

LTO 突破 TU 边界实现全局优化，代价是链接期 CPU/内存暴涨；ThinLTO 用摘要并行化，平衡收益与开销。

## 六、常见误区

1. 混用 lto 与非 lto 目标：链接器退回传统模式（只有非 LTO 部分参与），跨模块优化失效。
2. 以为 LTO 一定更快：小项目链接开销可能压倒收益，且增量构建变慢。
3. 内联导致栈回溯困难：需保留 `-g` 与 `.debug_*` 节，并理解内联后行号映射。
4. 误以为 LTO 能跨动态库优化：`.so` 是独立符号域，LTO 只覆盖同一链接单元内的静态目标。
5. 误以为 COMDAT 在 LTO 下仍重复：链接器按 COMDAT key 全局去重。

## 七、与开源书·权威来源对应

- 龙书第 8 章讲过程间分析（interprocedural analysis）与摘要表示。
- CSAPP 第 7 章铺陈链接与优化边界，解释为何需要 LTO。
- LLVM 文档讲 ThinLTO 的摘要、导入/导出与并行优化管线。
- GCC 手册 `-flto` 说明 bitcode 节与 `fat LTO` 对象（含机器码以备非 LTO 链接）。

## 八、面试题

1. LTO 原理？要点：目标文件存 IR，链接器合并 IR 后全局优化再 CodeGen。
2. ThinLTO 解决什么？要点：用摘要做跨模块导入决策，并行优化降低内存/时间。
3. 为何 LTO 能删死函数？要点：全局调用图可达性分析，不可达函数直接消除并移出符号表。
4. LTO 与动态库关系？要点：只覆盖同一静态链接单元，跨 `.so` 不可优化。

## 九、演进与趋势

- Modular LTO、WFMO（whole program devirtualization）使 C++ 模板与虚调用膨胀显著收敛。
- 跨模块专项优化（Cross-Module Inlining、CFI 集成）把安全与性能一起在 LTO 阶段处理。
- 与 `--gc-sections`/ICF 协同：IR 删函数 + 链接期回收节，双重瘦身。

## 十、小结

LTO 把链接器变成二次编译后端，以时间为代价换取跨模块全局优化；符号表在 IR 合并后被重构，死函数与重复 COMDAT 被消除，是大型 C/C++ 项目瘦身的终极手段。
