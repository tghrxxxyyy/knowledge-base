# 内存映射与mmap机制

> 对应 Arpaci-Dusseau《OSTEP》第 22 章（内存映射）；Silberschatz《Operating System Concepts》。

## 一、背景与挑战
文件 I/O 若经 read/write 需内核态拷贝多次。mmap 把文件直接映射进进程地址空间，按需分页调入，零拷贝且可共享。

## 二、核心原理
mmap 在虚拟地址空间建一段映射，关联文件某区间与页。首次访问触发缺页，内核读入文件页并建页表项。MAP_SHARED 多进程共享同一物理页；MAP_PRIVATE 写时复制（COW）。munmap 解除，msync 落盘。

## 三、形式化与数学基础
映射关系：
$$VA \in [base, base+len) \mapsto file[offset .. offset+len)$$
缺页时 $PFN = pagecache(file, offset + pageidx)$。COW 写触发副本：$PTE \gets copy$，$writeable$ 置位。

## 四、代码实现
```c
void *p = mmap(NULL, sz, PROT_READ,
               MAP_PRIVATE, fd, 0);
// 像访问内存一样读文件
process(p, sz);
munmap(p, sz);
```

## 五、与其他技术对比
mmap 省拷贝、适合随机大文件；read/write 对小顺序 I/O 更简单可控；MAP_ANONYMOUS 还用于堆扩展与共享内存。

## 六、常见误区
1. 改 MAP_PRIVATE 映射不影响文件——需 SHARED 才回写。
2. 映射后文件被截断致 SIGBUS。
3. 忘记 munmap 致地址空间泄漏。

## 七、与开源书/权威来源对应
OSTEP ch22；Silberschatz；remzi-arpacidusse/ostep-code；CSAPP 9 章。

## 八、面试题
问：mmap 为何快？SHARED 与 PRIVATE 区别？SIGBUS 来源？

## 九、演进与趋势
userfaultfd 让用户态参与缺页；DAX 让持久内存直映射免页缓存。

## 十、小结
mmap 把文件映射为地址空间，用缺页与 COW 实现零拷贝与按需共享。
