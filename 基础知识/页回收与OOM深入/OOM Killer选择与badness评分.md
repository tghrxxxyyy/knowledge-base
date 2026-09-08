> 对应 Linux 内核 Documentation（vm/）的 oom.rst 与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
当即使直接内存回收与压缩后仍无法满足分配，内核面临「杀一个进程换存活」的绝境。挑战是选择哪个进程牺牲，使「释放内存最多、系统损伤最小」，且决策必须快、不可死锁。

## 二、核心原理
OOM Killer 遍历所有进程，对每个进程调用 oom_badness 计算分数，选分数最高者 SIGKILL。分数基础是进程常驻内存（RSS + 交换占用 + 页表），并受 oom_score_adj 调节（-1000 表示永不被杀，如关键的 init/systemd）。被选中进程的 memory 立即被内核回收，分配路径得以继续。

## 三、形式化与数学基础
badness 的核心近似（简化自 mm/oom_kill.c）：
```
points = (get_mm_rss(p->mm) + get_mm_counter(swap)
          + mm_pgtables_bytes(p->mm) / PAGE_SIZE)
points *= 1000 / (available_pages + 1)        // 相对系统总量归一
points += oom_score_adj                        // 用户可调 [-1000,1000]
```
当 oom_score_adj == -1000 时直接返回 0（豁免）。最终选择 argmax points 的进程。

## 四、代码实现
```c
// mm/oom_kill.c（大幅简化）
unsigned long oom_badness(struct task_struct *p, ...)
{
    if (oom_unkillable_task(p) || task_zero_footprint(p))
        return 0;
    adj = (long)p->signal->oom_score_adj;
    if (adj == OOM_SCORE_ADJ_MIN)            // -1000
        return 0;
    points = get_mm_rss(p->mm) + get_mm_counter(p->mm, MM_SWAPENTS);
    points += atomic_long_read(&p->mm->pgtables_bytes) / PAGE_SIZE;
    points = points * 1000 / totalram_pages();
    return points + adj;
}
```

## 五、与其他技术对比
- 直接 panic：简单但整系统不可用，Linux 默认避免。
- cgroup 级 OOM：在 memcg 内选 victim，不波及全局（见本子目录第 6 篇）。
- 用户态 oomd：提前基于 pressure 杀进程，避免内核进入 OOM。

## 六、常见误区
- 误区：badness 只看 RSS。其实含 swap 与页表，且可被 oom_score_adj 覆盖。
- 误区：OOM 一定杀占用内存最大的进程。若其 adj=-1000 则豁免，转而杀次高者。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/admin-guide/mm/oom.rst 权威描述 badness 与 oom_score_adj。
- Silberschatz《Operating System Concepts》第 9 章讨论 thrashing 与终止进程策略。
- GitHub Vonng/ddia 的「资源调度」笔记类比「杀掉最贵任务」。

## 八、面试题
1. oom_score_adj 取何值可让进程永不被 OOM 杀？
2. badness 评分包含哪些内存成分？
3. 内核态进入 OOM 前已经尝试过哪些回收手段？

## 九、演进与趋势
早期 OOM 较粗暴；后续加入 memcg OOM、oom_score_adj、以及用户态 systemd-oomd 基于 PSI（Pressure Stall Information）的提前干预，把「硬 OOM」尽量转为「软驱逐」。

## 十、小结
OOM Killer 是内核的最后防线，用结合内存占用与可调权重的 badness 评分，在不可分配时牺牲最小代价进程以保全系统。
