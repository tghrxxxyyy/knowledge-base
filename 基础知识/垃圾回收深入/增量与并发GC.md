# 增量与并发GC

> 对应 Jones《GC Handbook》第 7-8 章 与 CS-Notes。

## 一、背景与挑战
传统 stop-the-world GC 造成长暂停。增量/并发 GC 把工作分摊到 mutator 运行期以降低停顿。挑战：mutator 与 GC 并发修改、浮动垃圾、正确性 (tri-color)。

## 二、核心原理
三色标记：白（待回收）、灰（已标记但其引用未扫）、黑（已扫）。不变式：无黑→白 指针（否则白被误回收）。Mutator 改引用时 write barrier 记录 (Dijkstra 屏障) 保不变式。

## 三、形式化 / 数学基础
三色不变式 (Dijkstra)：若 `black -> white` 出现则把该白置灰 (snapshot-at-start) 或把黑置灰 (incremental update)。
并发要求：`mutator` 与 `collector` 交替，禁止丢失仍可达对象。

## 四、代码实现
```python
def write_barrier(obj, field, val):
    obj[field] = val
    if color(obj) == BLACK and color(val) == WHITE:
        shade(val, GREY)   # 保三色不变式
```

## 五、与其他技术对比
- 增量（交替切片）：降单暂停但总吞吐略降。
- 并发（多核并行）：几乎无停顿但需屏障与内存序。
- STW：简单、吞吐高但暂停长。

## 六、常见误区
1. 并发 GC 无停顿（仍有短暂 STW 阶段如 relabel）。
2. 漏屏障致黑→白丢对象。
3. 误把浮动垃圾当泄漏（本周期内新分配可延后回收）。

## 七、与开源书 / 权威来源对应
- Jones, Hosking, Moss《The Garbage Collection Handbook》第 7-8 章
- CS-Notes: https://github.com/CyC2018/CS-Notes （CMS/G1/ZGC）
- Tanenbaum《Modern Operating Systems》

## 八、面试题
- 三色标记是什么？为何需要 write barrier？
- 什么是浮动垃圾？
- 并发 GC 为何仍有短暂停？

## 九、演进与趋势
ZGC/Shenandoah 并发转移、Region 并发压缩、以及亚毫秒级暂停。

## 十、小结
增量/并发 GC 用三色不变式与写屏障把回收融入运行期：以少量吞吐换极低延迟，是现代低延迟运行时的核心。
