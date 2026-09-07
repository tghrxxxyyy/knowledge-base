# 共享库版本符号与SONAME

> 对应 Levine《Linkers and Loaders》第 12 章。

## 一、背景与挑战
系统升级 libc 后，旧程序若直接复用新库可能因符号语义变化而崩溃，需要一套在不破坏兼容的前提下演进库的机制。

## 二、核心原理
每个共享库声明 SONAME（如 libc.so.6），可执行文件记录它依赖的 SONAME 而非具体文件名。版本符号（version symbol）给符号打版本标签，链接器记录最低所需版本，运行时只解析存在的版本节点。

## 三、形式化与数学基础
依赖图满足兼容性偏序：$v_a \preceq v_b$ 表示 $a$ 版符号集被 $b$ 包含。加载时要求：
$$\forall s \in needs(app),\ \exists v \ge minver(s)\ \text{in library}$$
否则报 version not found。

## 四、代码实现
```bash
# 查看 SONAME 与版本需求
readelf -d libdemo.so | grep SONAME
objdump -p app | grep NEEDED
readelf -V libc.so.6     # 版本符号节点
```

## 五、与其他技术对比
SONAME+版本符号提供向后兼容演进；纯文件名版本（libfoo-1.2.so）则靠包管理器硬隔离，无法同库多版本共存于单进程。

## 六、常见误区
1. 以为改名即可升级——必须保留旧 SONAME 软链供老程序用。
2. 误删 .so.6 软链会令所有依赖程序无法启动。
3. 版本符号只约束符号存在性，不保证语义兼容（ABI 层面）。

## 七、与开源书/权威来源对应
Levine ch12 详述版本脚本与 SONAME；glibc 源码与 ld.so 手册是权威参考。

## 八、面试题
问：SONAME 作用？ldconfig 做什么？为什么升级库通常不破坏旧程序？

## 九、演进与趋势
符号版本化与 ELF 符号过滤（symbol filtering）让单文件同时服务多 ABI 代际。

## 十、小结
SONAME 与版本符号把兼容性责任从文件名转移进 ELF 元数据，实现库平滑演进。
