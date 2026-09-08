# 等待队列唤醒模式exclusive

> 对应 Linux 内核 Documentation 与 Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战
默认 wake_up 唤醒队列中所有等待者，但很多场景（如仅一个工作者可取任务）只需唤醒一个，全部唤醒会造成「惊群」（thundering herd）浪费 CPU。

## 二、核心原理
等待者可用 WQ_FLAG_EXCLUSIVE 标记自己为独占等待者，加入队列尾部。wake_up 在遍历时遇到独占等待者只唤醒它并停止（对普通 wake_up 而言），从而把事件精准投递给一个等待者。非独占者（如 poll）仍会被全部唤醒。

## 三、形式化与数学基础
队列中等待者分两类：独占 $E$ 与普通 $N$。唤醒策略：

$$ \text{wake\_up}: \text{wake all } N,\ \text{then wake exactly one } e \in E,\ \text{stop} $$

即普通者全唤醒，首个遇到的独占者被唤醒后即终止遍历。

$$ |\{e \in E \text{ woken}\}| = 1 $$

## 四、代码实现
独占等待示例：

```c
DEFINE_WAIT(entry);
entry.flags |= WQ_FLAG_EXCLUSIVE;
prepare_to_wait_exclusive(&wq, &entry, TASK_UNINTERRUPTIBLE);
while (!cond) schedule();
finish_wait(&wq, &entry);

// 唤醒者：只唤醒一个独占者
wake_up(&wq);
```

## 五、与其他技术对比
默认 wake_up 全唤醒，适合状态变化需所有等待者重判（如条件变量 broadcast）；exclusive 适合资源被单个消费者取走；complete 偏一次性、complete_all 偏广播，语义各有侧重。

## 六、常见误区
认为 wake_up 总是只唤醒一个，默认是全唤醒；认为 exclusive 保证公平，顺序依赖入队位置；在需全部重判时用 exclusive 导致漏处理。

## 七、与开源书/权威来源对应
Linux 内核 wait.h 注释描述 exclusive 语义；Tanenbaum 讨论惊群；网络栈 accept 队列常利用 exclusive 唤醒。

## 八、面试题
exclusive 等待解决什么；为何普通等待者先全唤醒；惊群是什么；何时用 exclusive。

## 九、演进与趋势
网络与 IO 栈用 exclusive 减少多核 accept 竞争的惊群；epoll 结合不同唤醒模式优化吞吐。

## 十、小结
等待队列的 exclusive 模式通过只唤醒一个独占等待者避免惊群，是内核在「全唤醒正确性」与「单唤醒高效性」之间按需取舍的机制。
