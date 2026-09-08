# Store Buffer与内存一致性

> 对应 Intel SDM 卷3 与 Lamport 1979 关于内存一致性的论述。

## 一、背景与挑战
写缓冲让 store 延迟可见，但这破坏了顺序一致性（sequential consistency, SC）：一个核的 store 在刷出前，其它核看不到，本核却已「看到」自己。需要内存模型来规范这种可见性。

## 二、核心原理
x86 采用总存储有序（TSO, Total Store Order），允许 store 延迟可见（store→load 可重排），但保持 store→store、load→load、load→store 顺序。弱内存模型（如 ARM）允许更多重排，需显式屏障。

## 三、形式化与数学基础
顺序一致性要求所有处理器操作在全局单一顺序上一致。TSO 放松为：本核 store 进缓冲，仅允许较早的 load 越过较晚的 store：
$$L_i \prec S_j \Rightarrow \text{允许 } L_i \text{ 在 } S_j \text{ 刷出前完成}$$
其余顺序仍保留。

## 四、代码实现
```c
// TSO 下典型消息传递，需要 store 刷出才对端可见
x = 1;            // 入 store buffer
// 需要 sfence 或等待刷出，对端才能看到 x
```

## 五、与其他技术对比
SC 最简单但最慢；TSO 仅放松 store→load；弱模型（ARM/POWER）更宽松、性能更高，但编程需更多屏障。

## 六、常见误区
误认为 C 代码顺序即内存可见顺序。编译器与 CPU 都可能在遵守模型下重排，必须靠原子/屏障表达意图。

## 七、与开源书/权威来源对应
Intel SDM 卷3 的「Memory Ordering」章节规定 TSO；Lamport 的经典论文定义顺序一致性；ARMv8 手册描述其弱序与屏障。

## 八、面试题
问：为何 x86 消息传递可能失败？答：因为没有屏障时，store 在写缓冲中未刷出，对端 load 读到旧值，需写屏障或合适原子。

## 九、演进与趋势
语言级内存模型（C11/C++11、Java）把硬件差异抽象为 acquire/release，程序员不再直接面对各架构细节。

## 十、小结
Store Buffer 提升写性能但以放松一致性为代价，理解 TSO 与 SC 的差异是并发编程的基础。
