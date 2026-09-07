# MESI 与一致性模型关系

> 对应 Hennessy & Patterson 量化方法缓存一致性章。

## 一、背景与挑战
多核共享内存需保证"同一地址的写对所有核一致"。MESI 协议在缓存级强制单写多读不变式，是弱/强内存模型得以成立的物理基础。

## 二、核心原理
每个缓存行处 Modified/Exclusive/Shared/Invalid 之一。写未拥有需先获取 Exclusive（Invalidate 他人）；读可共享。MESI 保证"全局写串行化"，但单核内的重排（TSO/弱内存）仍由该核的一致性模型决定。

## 三、形式化与数学基础
不变式：任一地址最多一个 Modified 或 Exclusive 副本；Shared 可多。写获取代价：
$$Cost_{write} = \begin{cases} 0 & state \in \{M,E\} \\ BusRdX+Inv & state = S/I \end{cases}$$
一致性保证所有核对同一地址看到相同写顺序。

## 四、代码实现
```c
// 简化的MESI状态机片段
enum {M,E,S,I} state;
void on_local_write() {
    if (state==S||state==I){ send_bus_rdx(); state=M; } // 取独占
    else state=M;
    data = newval;
}
void on_bus_invalidate() { if(state!=I) state=I; }
```

## 五、与其他技术对比
MESI 解决"缓存一致性"（单地址多副本一致），内存模型解决"多地址访问顺序可见性"，二者正交：MESI 提供底层写串行化，模型在其上允许重排。

## 六、常见误区
误以为 MESI 即内存一致性：它只保单地址一致，不约束跨地址顺序。误以为 Invalid 即丢失数据：Modified 会写回。

## 七、与开源书/权威来源对应
量化方法缓存一致性；OSTEP 同步章；6.824 分布式类比。

## 八、面试题
问：MESI 与 TSO 关系？答：MESI 保单地址一致，TSO 在该之上允许 StoreLoad 重排。

## 九、演进与趋势
MESIF/MOESI 优化转发，目录协议扩展至多插槽，与一致性互连（CCIX/CXL）结合。

## 十、小结
MESI 是内存一致性模型的物理承载：没有缓存一致性，任何高级内存序都无从落地。
