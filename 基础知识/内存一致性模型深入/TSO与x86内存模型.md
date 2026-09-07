# TSO 与 x86 内存模型

> 对应 Intel SDM 卷3 内存排序章节（厂商手册）。

## 一、背景与挑战
x86 采用总存储顺序（TSO），是 SC 的小幅松弛：仅允许"较早的写"被"较晚的读"越过（StoreLoad 重排），其余保持顺序。这兼顾性能与编程友好。

## 二、核心原理
TSO 下每个核有 FIFO 写缓冲（store buffer）。读可绕过自身待提交写而直接读内存，故可能看到其他核的写早于自己未提交的写——即 StoreLoad 重排。其他三类（LoadLoad/LoadStore/StoreStore）不被重排。

## 三、形式化与数学基础
TSO 允许的唯一重排：
$$W_1; R_2 \;\text{可见为}\; R_2; W_1 \quad (\text{若地址不同})$$
禁止：
$$R;R,\; R;W,\; W;W$$
因此只需 MFENCE 或 LOCK 前缀阻止 StoreLoad。

## 四、代码实现
```c
// x86 TSO下需MFENCE防止StoreLoad重排
volatile int flag = 0, data = 0;
void producer() {
    data = 42;
    __asm__ __volatile__("sfence" ::: "memory"); // 或 mfence
    flag = 1;
}
int consumer() {
    while (!flag) {}
    __asm__ __volatile__("lfence" ::: "memory");
    return data; // 保证读到42
}
```

## 五、与其他技术对比
TSO 比 SC 弱但比 ARM 弱内存强；ARM 需显式 acquire/release 才保证，x86 很多情况自然成立，易让人写出不可移植代码。

## 六、常见误区
误以为 x86 无重排：StoreLoad 存在。误以为单线程重排不可见：其他核可见。

## 七、与开源书/权威来源对应
Intel SDM 卷3 §8.2；C++ 内存模型；Linux 内核 memory-barriers.txt。

## 八、面试题
问：x86 程序员为何容易写出非 SC 的 bug？答：TSO 隐藏了 StoreLoad 之外的重排，移植到 ARM 失败。

## 九、演进与趋势
C++ 原子操作将平台差异封装，鼓励用 acquire/release 而非裸 fence。

## 十、小结
TSO 是性能与易用性的折中，理解其唯一允许的 StoreLoad 重排是写可移植并发代码的关键。
