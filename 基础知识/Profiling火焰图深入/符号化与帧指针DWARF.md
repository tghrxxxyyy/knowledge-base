# 符号化与帧指针DWARF

> 对应 《CSAPP》第7章 符号表 / Brendan Gregg 栈展开文档。

## 一、背景与挑战
采样得到的是指令地址，需映射回函数名与行号才可读。若编译去掉帧指针且缺 DWARF，栈无法展开，火焰图只剩一层甚至错乱。

## 二、核心原理
帧指针(FP, x86 `rbp`)链指回调用者栈帧，展开快但需 `-fno-omit-frame-pointer`。DWARF 的 `.debug_frame` 提供任意 PC 到栈帧的查表规则，无需 FP 但解析慢。符号表 `.symtab` 完成地址到名字映射。

## 三、形式化与数学基础
地址到符号：
$$ sym = lookup(addr),\ addr \in [sym.base, sym.base+sym.size) $$
展开规则集 $R(pc) \to (cfa, ra)$ 给出规范帧地址与返回地址。

## 四、代码实现
```bash
# 编译保留帧指针，剥离前保留符号
gcc -O2 -g -fno-omit-frame-pointer app.c -o app
# 用 perf 展开需 DWARF
perf record -F 99 -g -p PID sleep 10
perf script --header   # 展开依赖 FP 或 unwind 信息
```

## 五、与其他技术对比
FP 展开快但占寄存器；DWARF 通用但慢；LBR(最后分支记录)提供精确栈但深度有限。三者按场景选。

## 六、常见误区
默认 -O2 常省略 FP 导致栈断。strip 掉符号后只剩地址。容器内无调试信息则无法符号化。

## 七、与开源书/权威来源对应
《CSAPP》7 链接与符号；DWARF 标准；perf 文档 `--call-graph` 选项。

## 八、面试题
为何栈会断？FP 与 DWARF 区别？如何保留符号？

## 九、演进与趋势
ORC unwinder(Linux 内核自带快速展开)、BTF 嵌入类型；默认开启 FP 的趋势回归。

## 十、小结
符号化依赖符号表与栈展开信息，编译期保留 FP/DWARF 是得到可读火焰图的前提。
