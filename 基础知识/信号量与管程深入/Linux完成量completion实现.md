# Linux完成量completion实现

> 对应 Linux 内核 Documentation 与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
一个线程常需等待另一个线程完成某项一次性工作（如初始化完毕、IO 完成）。用信号量或忙等都不够直观，completion 是内核专为此设计的轻量原语。

## 二、核心原理
completion 含一个等待队列与完成计数。wait_for_completion 在计数未达时睡眠；complete 把计数加一并唤醒一个等待者，complete_all 唤醒全部。它内建防止丢失唤醒的机制（计数只增），适合一次性事件。

## 三、形式化与数学基础
状态 $(W, C)$，$W$ 为等待者集合，$C$ 为完成计数。等待：

$$ \text{wait}: \text{if } C=0 \text{ sleep};\ \text{else proceed} $$

完成：

$$ C \gets C+1;\ \text{wake } W $$

由于 $C$ 单调不减，已发生的完成不会被遗漏（区别于需用 while 的条件变量）。

## 四、代码实现
内核 completion 用法：

```c
DECLARE_COMPLETION(boot_done);

// 工作线程
do_setup();
complete(&boot_done);

// 等待线程
wait_for_completion(&boot_done);   // 可睡眠等待
proceed_after_setup();
```

## 五、与其他技术对比
completion 比信号量语义清晰（一次性事件），比忙等省 CPU，比条件变量轻（不需要显式谓词重查）。它本质是计数信号量的特化，但 API 更安全。

## 六、常见误区
认为 completion 可重复用作周期信号，它面向一次性完成；在中断上下文调用 wait_for_completion（会睡眠）错误；complete 多次语义依 complete_all 而定。

## 七、与开源书/权威来源对应
Linux 内核 include/linux/completion.h 与 Documentation/scheduler/completion.rst；Silberschatz 讨论等待完成；OSTEP 涉及等待。

## 八、面试题
completion 与信号量区别；为何不会丢失唤醒；适用场景；complete_all 作用。

## 九、演进与趋势
completion 在驱动探测与异步初始化中广泛使用；与 kthread、workqueue 协作构建启动流程。

## 十、小结
completion 是内核用于「等待一次性完成事件」的轻量原语，以单调计数避免丢失唤醒，比信号量更贴合其语义。
