# HTM与锁的混用

> 对应 Intel《TSX Best Practices》与各类 HyTM（混合事务内存）研究。

## 一、背景与挑战
纯 HTM 难覆盖所有情况（大临界区、系统调用）。实践中采用 HyTM：事务包裹临界区，失败则降级为传统锁，兼顾性能与正确性。

## 二、核心原理
HLE 的 XACQUIRE/XRELEASE 通过在锁变量上做「锁消除」实现：若事务成功，锁从未真正获取；若中止，硬件自动「按原语义」获取锁。这样旧代码几乎零改动即可受益。

## 三、形式化与数学基础
设锁获取 L.acq()。HLE 语义：
$$XACQUIRE(L.acq) \Rightarrow \text{if txn commits, } L \text{ never held; if aborts, } L \text{ actually acquired}$$
保证无论走哪条路径，互斥不变。

## 四、代码实现
```asm
; HLE 包裹自旋锁
xacquire lock inc [counter]
; 临界区
xrelease lock dec [counter] ; 实际无需解锁（未真正持有）
; 失败则硬件按普通锁执行
```

## 五、与其他技术对比
纯锁：简单但低并发。纯 HTM：高并发但受限。HyTM：默认事务、失败锁兜底，最实用。

## 六、常见误区
误认为加 XACQUIRE 就保证无锁。事务仍可能中止并实际获取锁，且锁内不能有不可事务化操作。

## 七、与开源书/权威来源对应
Intel TSX 最佳实践文档强调 fallback 与冲突调优；HyTM 论文（如 Dalessandro et al.）分析正确性。

## 八、面试题
问：HLE 如何向后兼容？答：XACQUIRE 在旧 CPU 上被忽略、按普通锁执行，新 CPU 上做锁消除，二进制兼容。

## 九、演进与趋势
随 TSX 在部分型号被禁用，HyTM 实用性受挫，社区更关注可移植的 STM/无锁方案。

## 十、小结
HTM 与锁混用（HyTM）是工程现实：事务优先、锁兜底，兼顾性能与鲁棒性。
