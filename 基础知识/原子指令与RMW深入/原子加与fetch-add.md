# 原子加与fetch-add

> 对应 C++11 fetch_add 与 x86 LOCK XADD 指令。

## 一、背景与挑战
计数器、引用计数等场景只需「读旧值并加」这类受限 RMW。专用原子加（fetch-add / atomic increment）比通用 CAS 更高效，且不被 ABA 困扰。

## 二、核心原理
fetch_add 原子地返回旧值并加上增量。硬件上 x86 用 LOCK XADD，或在缓存行上 obtain 独占后执行；多核下冲突通过缓存一致性（MESI）串行化。

## 三、形式化与数学基础
设初值 $v_0$，并发 $n$ 次加 $d_i$：
$$v_{final} = v_0 + \sum_{i=1}^{n} d_i$$
串行化保证每步 $v_{k+1}=v_k+d_{\pi(k)}$ 对某一排列 $\pi$ 成立。

## 四、代码实现
```c
std::atomic<long> counter{0};
void inc(){ counter.fetch_add(1, std::memory_order_relaxed); }
// x86 编译为 lock xadd [counter], rax
```

## 五、与其他技术对比
fetch_add 比 CAS 循环简单且避免 ABA；但只能表达「加」，无法做任意条件更新。

## 六、常见误区
误认为 relaxed 内存序不安全。计数器本身若只求最终和，relaxed 足够；但若计数同时用于同步（如变成标志），则需更强序。

## 七、与开源书/权威来源对应
C++ 标准 atomic::fetch_add；x86 SDM 的 LOCK 前缀与 XADD 描述；Herlihy 将 fetch-add 列为基础共识对象。

## 八、面试题
问：为何计数器常用 relaxed？答：只关心最终聚合值、不借其建立跨变量顺序时，relaxed 省去屏障开销且结果仍正确。

## 九、演进与趋势
硬件提供向量化原子与新型「fetch-and-op」减少热点竞争（如 Armv8.1 LSE 扩展）。

## 十、小结
原子加是 RMW 家族中最高效、最专用的成员，适合计数等纯聚合场景，免 ABA、低开销。
