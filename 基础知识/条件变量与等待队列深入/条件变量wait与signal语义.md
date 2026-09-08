# 条件变量wait与signal语义

> 对应 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
互斥只解决「同时只有一个进临界区」，但很多场景要「等到某条件成立才继续」。条件变量提供在谓词不满足时挂起、被改变状态者唤醒的机制，必须配合互斥使用。

## 二、核心原理
条件变量 cv 与互斥 m 绑定。wait(cv,m) 原子地释放 m 并睡眠，被唤醒后重新获取 m。signal(cv) 唤醒至少一个等待者，broadcast(cv) 唤醒全部。谓词检查与等待在互斥保护下进行。

## 三、形式化与数学基础
设谓词 $P$，互斥 $M$。正确协议：

$$ \text{lock}(M);\ \text{while } \neg P\ \text{wait}(cv,M);\ \text{action};\ \text{unlock}(M) $$

状态改变者：

$$ \text{lock}(M);\ \text{mutate};\ \text{signal}(cv);\ \text{unlock}(M) $$

关键：wait 在释放锁与睡眠间原子，避免丢失唤醒。

## 四、代码实现
pthread 条件变量：

```c
pthread_mutex_t m = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t cv = PTHREAD_COND_INITIALIZER;
int ready = 0;

void *waiter(void *a) {
    pthread_mutex_lock(&m);
    while (!ready) pthread_cond_wait(&cv, &m);
    // 条件成立
    pthread_mutex_unlock(&m);
    return NULL;
}
void setter() {
    pthread_mutex_lock(&m);
    ready = 1;
    pthread_cond_broadcast(&cv);
    pthread_mutex_unlock(&m);
}
```

## 五、与其他技术对比
信号量可表达类似语义但无谓词绑定，易漏唤醒；条件变量强制与互斥与 while 谓词配合，更安全；RCU 在无锁读场景替代二者。

## 六、常见误区
用 if 而非 while 检查谓词（Mesa 语义下会出错）；signal 前未持锁导致竞态；认为 signal 一定唤醒正确线程。

## 七、与开源书/权威来源对应
Silberschatz《Operating System Concepts》第 6 章条件变量；Tanenbaum 讨论管程内条件；Lamport 1978 提供事件次序基础。

## 八、面试题
条件变量为何需互斥；wait 原子性的重要性；signal 与 broadcast 区别；为何 while 重查。

## 九、演进与趋势
futex 高效实现用户态条件变量；C++ std::condition_variable、Rust Condvar 延续相同语义；结构化并发减少手工使用。

## 十、小结
条件变量在互斥保护下提供谓词等待，wait 的原子释放-睡眠与 while 重查是其正确使用的两大支柱。
