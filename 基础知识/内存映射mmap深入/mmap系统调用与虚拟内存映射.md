# mmap系统调用与虚拟内存映射

> 对应 Kerrisk《The Linux Programming Interface》第 49 章与 Bryant & O'Hallaron《CSAPP》第 9 章虚拟内存。

## 一、背景与挑战
频繁 `read/write` 需内核在用户缓冲与页缓存间拷贝，且每次系统调用有上下文切换开销。mmap 把文件或匿名内存直接映射进进程虚拟地址空间，让用户态指针直接访问，省去拷贝与部分系统调用。

## 二、核心原理
`mmap` 在进程虚拟地址空间（VMA，vm_area_struct 链表/树）中分配一段区域，建立"虚拟页→文件偏移/物理页"的映射。映射建立时不分配物理页，访问时触发缺页异常按需填充。返回用户可直接解引用的指针。

## 三、形式化与数学基础
设虚拟地址 $v$ 落在 VMA $[start,end)$，文件映射满足：
$$phys(v) = file\_page(off + (v - start))$$
匿名映射 $phys(v)$ 为某零页或后来分配的物理帧。页表项 PTE 记录帧号与权限 $R/W/X$。

## 四、代码实现
```c
// 把文件映射进内存，直接当数组访问
int fd = open("data", O_RDONLY);
struct stat st; fstat(fd, &st);
char *p = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
// 之后 p[i] 即文件第 i 字节，无需 read
munmap(p, st.st_size);
```

## 五、与其他技术对比
mmap 省拷贝适合大文件随机访问；read/write 简单、缓存可控、适合顺序流。相较 `O_DIRECT`，mmap 走页缓存。

## 六、常见误区
误以为 mmap 立即读盘：只是建映射，缺页才读。误以为 mmap 比 read 总更快：小文件/随机冷读可能因缺页更慢。误以为 munmap 保证落盘：需先 msync。

## 七、与开源书/权威来源对应
CSAPP 9.8 讲 mmap；Kerrisk 第 49 章覆盖标志、对齐与同步；OSTEP 虚拟内存章。

## 八、面试题
问：mmap 与 read 的本质差别？答：mmap 建地址映射零拷贝访问，read 需拷贝进用户缓冲。问：MAP_PRIVATE 写会怎样？

## 九、演进与趋势
map_files、userfaultfd 支持按需用户态填充缺页；大页（THP）映射降低 TLB 压力。

## 十、小结
mmap 用 VMA 把文件/内存直接投影到虚地址，靠缺页按需填充，是零拷贝访问的基石。
