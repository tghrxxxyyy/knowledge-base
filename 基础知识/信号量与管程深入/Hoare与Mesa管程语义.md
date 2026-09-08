# Hoare与Mesa管程语义

> 对应 Silberschatz《Operating System Concepts》与 Lamport 1978。

## 一、背景与挑战
管程中 signal 之后谁先执行、被唤醒者是否立即获得管程锁，存在两种经典语义：Hoare 语义与 Mesa 语义，二者影响编程模型与正确性。

## 二、核心原理
Hoare 语义：signal 时立即把管程控制权交给被唤醒线程，唤醒者阻塞，直到被唤醒者退出或等待才恢复——保证被唤醒时谓词一定为真。Mesa 语义：signal 仅把被唤醒者放入就绪队列，唤醒者继续持有管程，被唤醒者稍后竞争锁——故被唤醒时谓词可能已变，必须重新检查（while 循环）。

## 三、形式化与数学基础
令 $R$ 为管程锁持有者。Hoare：

$$ \text{signal}: R \to \text{waiter},\ \text{waiter runs with } R $$

Mesa：

$$ \text{signal}: \text{waiter} \in \text{ready};\ R \text{ 仍属 signaler} $$

因此 Mesa 要求：

$$ \text{upon wakeup: recheck predicate} $$

## 四、代码实现
Mesa 语义的 while 检查（Java/notify 即 Mesa 风格）：

```java
synchronized void take() throws InterruptedException {
    while (count == 0) wait();   // 必须重查
    // ...
    notify();
}
```

Hoare 风格可用 signal 后立即无重查，但实现成本更高。

## 五、与其他技术对比
Hoare 语义正确性好但需线程切换（signal 即让权），开销大；Mesa 语义更易实现（仅排队）但要求程序员重查谓词。现代实现（Java、pthread cond）多为 Mesa 风格。

## 六、常见误区
认为 Mesa 下被唤醒即可安全执行，未重查谓词会出错；认为 notify 与 Hoare signal 等价，二者调度不同；忽略广播（broadcast/notifyAll）场景。

## 七、与开源书/权威来源对应
Silberschatz《Operating System Concepts》第 6 章管程小节；Tanenbaum 对比两种语义；Lamport 1978 提供事件序的形式化背景。

## 八、面试题
Hoare 与 Mesa 的核心差别；为何 Mesa 要 while 重查；开销差异；notifyAll 用途。

## 九、演进与趋势
async/await 与结构化并发吸收管程思想；形式化工具有助于验证条件变量使用正确。

## 十、小结
Hoare 与 Mesa 是管程 signal 的两种语义，Hoare 保证唤醒即满足、Mesa 仅排队须重查，现代系统普遍采用实现更简单的 Mesa 语义。
