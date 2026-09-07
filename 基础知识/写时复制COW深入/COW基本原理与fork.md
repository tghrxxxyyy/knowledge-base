# COW基本原理与fork

> 对应 Rosenblum & Ousterhout 1992（日志结构文件系统中的写时复制思想）与 Bryant & O'Hallaron《CSAPP》第 8 章。

## 一、背景与挑战
`fork` 若立即复制父进程全部地址空间（可能数百 MiB），即便子进程马上 `exec` 也会被整体丢弃，浪费巨大。写时复制（COW）让父子先共享物理页，仅当一方写入才真正复制。

## 二、核心原理
fork 时内核复制页表但把父子所有可写 PTE 标记为只读并打 COW 标记；物理页引用计数加一。任一方写触发 `#PF`，内核发现 COW 页则分配新帧、复制内容、把写者 PTE 改回可写，另一份保持。exec 时直接丢弃共享页，零复制。

## 三、形式化与数学基础
fork+exec 成本：
$$T_{COW} = O(pages_{shared}) \ll T_{copy} = O(addrspace\_size)$$
写时复制页 $i$ 的复制条件：$write(i)$ 且 $refcount(i) > 1$。fork 后物理占用不变，仅页表复制 $O(\frac{addrspace}{page})$。

## 四、代码实现
```c
pid_t pid = fork();
if (pid == 0) {
    execl("/bin/ls", "ls", NULL);  // 不写则可共享父页，零复制
} else {
    wait(NULL);
}
// 若子进程写变量，则触发 COW 复制该页
```

## 五、与其他技术对比
COW 复制 vs  eager copy（fork 即全拷）：前者省 exec 路径。相较 vfork（共享地址空间），COW 安全可写。相较 `clone` 精细共享，COW 是粗粒度自动。

## 六、常见误区
误以为 fork 后内存立刻翻倍：COW 下物理占用不变直到写。误以为 COW 完全免费：页表复制与缺页有成本。误以为子进程写不影响父：各自独立副本。

## 七、与开源书/权威来源对应
CSAPP 8.4 讲 fork 与 COW；OSTEP 进程章与 Rosenblum 1992 提出 COW 用于 LFS 快照。

## 八、面试题
问：fork 后父子同时写一个全局变量会互相影响吗？答：不会，写触发 COW 各自独立。问：为什么 fork+exec 高效？

## 九、演进与趋势
`clone` 标志细粒度共享；userfaultfd 支持用户态 COW；大页 COW 复杂化（需分裂或整页复制）。

## 十、小结
COW 让 fork 的语义（独立地址空间）与性能（延迟复制）兼得，是 Unix 进程模型的精髓。
