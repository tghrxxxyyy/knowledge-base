# 计数信号量与P与V操作

> 对应 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
需要限制同时访问某资源的实体数量（如连接池大小），或协调生产者消费者，单纯互斥不够。信号量以整数计数与原子 P/V 提供通用同步。

## 二、核心原理
信号量 $S$ 是非负整数，P（proberen，荷兰语测试）在 $S>0$ 时减一，否则阻塞；V（verhogen，增加）把 $S$ 加一并唤醒一个等待者。计数信号量记录可用资源数，初值可为大于一。

## 三、形式化与数学基础
P/V 的原子语义：

$$ P(S): \text{while } S=0 \text{ wait};\ S \gets S-1 $$
$$ V(S): S \gets S+1;\ \text{wake one waiter} $$

不变量：

$$ S \ge 0 \quad\text{(计数信号量)}\quad\text{且活跃访问数} \le S_{init} $$

用信号量可构造互斥（$S_{init}=1$ 即二值信号量）。

## 四、代码实现
生产者消费者（信号量）：

```c
sem_t empty, full, mutex;
sem_init(&empty, 0, N);
sem_init(&full, 0, 0);
sem_init(&mutex, 0, 1);

// 生产者
sem_wait(&empty);
sem_wait(&mutex);
buffer[in] = item; in = (in+1)%N;
sem_post(&mutex);
sem_post(&full);

// 消费者
sem_wait(&full);
sem_wait(&mutex);
item = buffer[out]; out = (out+1)%N;
sem_post(&mutex);
sem_post(&empty);
```

## 五、与其他技术对比
互斥锁仅二值且持有者才能释放；信号量可由任意线程 V，更灵活但有「谁都能释放」的风险；条件变量必须与互斥配合且靠谓词等待，信号量把计数与等待合一。

## 六、常见误区
认为信号量一定公平，唤醒顺序依赖实现；在中断上下文用可能睡眠的信号量；用信号量代替条件变量导致难以表达复杂谓词。

## 七、与开源书/权威来源对应
Silberschatz《Operating System Concepts》第 6 章信号量与经典问题；Tanenbaum 亦有；Linux 内核的 sem 与 completions 相关。

## 八、面试题
P/V 语义；计数与二值信号量区别；用信号量实现生产者消费者；信号量缺点。

## 九、演进与趋势
现代更倾向用条件变量+互斥表达复杂同步；但信号量在资源计数场景仍简洁；用户态 futex 提供高效实现。

## 十、小结
信号量以原子计数与等待队列统一了互斥与资源计数，P/V 是其核心，是并发同步最经典也最通用的原语之一。
