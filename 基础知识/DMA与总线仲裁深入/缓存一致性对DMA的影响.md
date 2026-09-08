# 缓存一致性对DMA的影响

> 对应 Hennessy & Patterson《Computer Architecture》与 Intel SDM 卷3。

## 一、背景与挑战
DMA 直接读写内存，而 CPU 可能缓存了同一地址。若不同步，DMA 看到陈旧数据或内存的新数据被缓存的旧值覆盖（cache pollution / stale）。

## 二、核心原理
方向一（CPU→设备）：DMA 前需将涉及地址的缓存行写回（clean/flush）。方向二（设备→CPU）：DMA 后需将缓存行无效化（invalidate）以便 CPU 取新值。Coherent DMA 由硬件（如 ACE/IO-coherence）自动维持。

## 三、形式化与数学基础
一致性条件要求对任意地址 a，内存视图与缓存视图满足：

    \forall a: M[a] == C_{owner}[a]

DMA 传输前后需使 owner 在内存与缓存间正确切换。

## 四、代码实现
```c
#include <libkern/OSCacheControl.h>
void dma_sync(void *buf, size_t len, int to_device) {
    if (to_device)
        __builtin___clear_cache(buf, (char*)buf + len); // 写回
    else
        __builtin___clear_cache(buf, (char*)buf + len); // 无效
}
```

## 五、与其他技术对比
非一致 DMA 需手动 sync 且易出错；硬件一致 DMA（IO coherent）省去软件同步但增加互联复杂度与延迟。

## 六、常见误区
误以为 malloc 的内存 DMA 安全；未对齐或缓存行跨越会出问题。误以为读设备数据后可直接用缓存值。

## 七、与开源书/权威来源对应
Hennessy & Patterson 讨论 I/O 与缓存一致性；Intel SDM 卷3 讲 DMA 与缓存。

## 八、面试题
1. 设备写入内存后 CPU 读到旧值怎么办？答：invalidate 缓存行。
2. 何为 cache-coherent DMA？

## 九、演进与趋势
IO 一致性互联（CCIX、CXL）让 DMA 与 CPU 缓存真正一致，简化驱动。

## 十、小结
DMA 必须与缓存正确同步，手动 flush/invalidate 或硬件一致性保证数据视图统一。
