# CAS与原子比较交换

> 对应 Herlihy《Wait-Free Synchronization》(1991) 与 C++11 atomic_compare_exchange。

## 一、背景与挑战
读-改-写（RMW）需在单一不可分割操作中读取旧值并写入新值。比较并交换（CAS, Compare-And-Swap）是最通用的 RMW 原语，几乎所有无锁算法都建立在它之上。

## 二、核心原理
CAS(addr, expected, desired) 原子地：若 `*addr == expected` 则写入 desired 并返回成功，否则把 `*addr` 载入 expected 并返回失败。循环重试（CAS 循环）实现任意原子更新。

## 三、形式化与数学基础
CAS 原子性：
$$\text{CAS}(A,e,d) = \begin{cases} A\leftarrow d,\; \text{return true} & \text{if } A=e\\ e\leftarrow A,\; \text{return false} & \text{otherwise} \end{cases}$$
整个判等与写入对其它处理器不可分。

## 四、代码实现
```c
// 用 CAS 实现原子自增
void atomic_inc(std::atomic<int>* a){
    int e = a->load();
    while (!a->compare_exchange_weak(e, e+1)) {
        // e 已被更新为当前值，重试
    }
}
```

## 五、与其他技术对比
CAS 比 test-and-set 更通用（可构造任意更新），但存在 ABA 问题；x86 的 LOCK CMPXCHG 是其硬件实现。

## 六、常见误区
误认为 CAS 一定成功。高竞争下 CAS 可能反复失败（活锁），需退避策略。

## 七、与开源书/权威来源对应
Herlihy 1991 证明 CAS 可构造 wait-free 任意对象；C++ 标准定义 compare_exchange 的强弱版本。

## 八、面试题
问：CAS 的 ABA 问题是什么？答：地址值从 A 变 B 又变回 A，CAS 误判未变而覆盖中间变化，需用带标签/版本号解决。

## 九、演进与趋势
硬件引入双字 CAS（DCAS / 带版本号）缓解 ABA；语言层用 hazard pointer、epoch 等配套。

## 十、小结
CAS 是无锁编程的基石，理解其原子语义与 ABA 陷阱是编写正确并发算法的关键。
