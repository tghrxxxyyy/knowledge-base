> 对应 Linux 内核 Documentation（scheduler/sched-nice-design.rst）与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
用户用 nice 值（-20..19）表达「想多/少占 CPU」的意愿，但调度器内部需要把它换算成可运算的权重，并保证「每降低一个 nice 值，CPU 份额约增 10%」（经典 nice 语义）。挑战是高效且平滑地映射。

## 二、核心原理
CFS 用一张 sched_prio_to_weight 表把 nice 值映射到权重（nice 0 = 1024）。每差一个 nice 级别，权重乘以约 1.25（即 1024→1280→1600…），使 CPU 份额近似按 10% 递增。vruntime 增量按 NICE_0_LOAD/weight 缩放，从而权重高的实体 vruntime 增长慢、获得更多 CPU。

## 三、形式化与数学基础
权重表递推：
```
weight(nice) = weight(nice+1) * 1.25   （近似）
```
对两个实体 A、B，其 CPU 份额比约等于权重比：
```
share(A) / share(B) = weight(A) / weight(B)
```
CFS 运行队列的 normalized 负载 = Σ weight_i，某实体所得比例 = weight_i / Σ weight。

## 四、代码实现
```c
// kernel/sched/core.c（表节选，简化）
const int sched_prio_to_weight[40] = {
/* -20 */ 88761, 71755, 56483, 46273, 36291,
/* -15 */ 29154, 23254, 18705, 14949, 11916,
/* -10 */  9548,  7620,  6100,  4904,  3906,
/*  -5 */  3121,  2501,  1991,  1586,  1277,
/*   0 */  1024,   820,   655,   526,   423,
/*  +5 */   335,   272,   215,   172,   137,
/* +10 */   110,    87,    70,    56,    45,
};
// vruntime 缩放
delta_v = __calc_delta(delta_exec, NICE_0_LOAD, &se->load);
```

## 五、与其他技术对比
- 静态优先级数值：直观但难表达比例份额。
- nice→weight 表：高效查表、平滑比例。
- 实时优先级：绝对抢占，不按比例分享。

## 六、常见误区
- 误区：nice 差值线性对应 CPU 时间差。实际按 1.25 倍权重比，是乘性而非加性。
- 误区：root 之外用户能把 nice 调到 -20。非特权用户只能调高（更友好），不能调低。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/scheduler/sched-nice-design.rst 讲 nice 与权重。
- Silberschatz《Operating System Concepts》讨论优先级与公平。
- GitHub CyC2018/CS-Notes 的调度小节提到 nice。

## 八、面试题
1. nice 每差一级，CPU 份额约变化多少？
2. 为什么 vruntime 要用权重缩放而非直接用 nice？
3. 非特权用户能否设置负 nice？

## 九、演进与趋势
权重表固定查表避免浮点；与组调度（cpu.shares）结合，把单进程权重扩展到层级化份额分配。

## 十、小结
nice→weight 的查表映射把用户语义的「友好度」转为调度器可运算的「份额比例」，是 CFS 实现公平的核心换算。
