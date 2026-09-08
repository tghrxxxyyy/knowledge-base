> 对应 Tanenbaum《Modern Operating Systems》「Swapping」与 Linux 内核 Documentation（admin-guide/swap-space.rst）。

## 一、背景与挑战
物理内存有限，需把不常用页暂存到磁盘以腾出 RAM 给更热的数据。挑战是提供一块「连续可随机访问」的磁盘空间，既能作为匿名页的家，又能被内核高效管理，且不破坏文件系统一致性。

## 二、核心原理
Swap 可以是独立分区（swap partition）或文件（swapfile）。二者都先经 mkswap 写入一个 swap 头部（含签名「SWAPSPACE2」、页槽位数、UUID），再 swapon 挂载进内核。内核维护一个 swap_info_struct 数组，每个条目描述一块 swap 区域及其页槽位（slot）位图。

## 三、形式化与数学基础
一块 swap 区域容量为 N 个页槽位，每个槽位 i 容纳一页。槽位分配是位图上的空闲查找：
```
allocate_slot() -> 最小可用 i, 其中 bitmap[i] == 0
free_slot(i)    -> bitmap[i] = 0
```
磁盘偏移 = slot_index × PAGE_SIZE + swap_header_offset。总 swap 能力 = Σ_i N_i（各 swap 区域之和）。

## 四、代码实现
```c
// 用户态等价：mkswap 后内核用 sys_swapon 注册
// mm/swapfile.c（简化）
static int setup_swap_map(struct swap_info_struct *p,
                          union swap_header *swap_header,
                          unsigned long maxpages)
{
    p->max = maxpages;
    p->pages = maxpages - 1;            // 头部占一槽
    // 初始化 slot 位图，标记已用头部
    swap_map[0] = SWAP_MAP_BAD;
    return 0;
}
// 命令行
// mkswap /dev/sda2 ; swapon /dev/sda2
// fallocate -l 4G /swapfile ; mkswap /swapfile ; swapon /swapfile
```

## 五、与其他技术对比
- 分区 swap：连续、性能稳、不占文件系统。
- 文件 swap：灵活、易调整、但受文件系统碎片影响（btrfs 有特殊处理）。
- 无 swap：依赖 OOM，缺少「冷页外置」缓冲。

## 六、常见误区
- 误区：swap 等于「内存不够才用」。实际内核会主动把空闲 RAM 中的冷匿名页换出，提升文件缓存命中。
- 误区：swapfile 性能一定差。现代 fallocate 预分配的文件可接近分区性能。

## 七、与开源书/权威来源对应
- Tanenbaum《Modern Operating Systems》第 4 章解释 swapping 的动机。
- Linux 内核 Documentation/admin-guide/swap-space.rst 讲 swapon/mkswap。
- GitHub Hansimov/csapp 的「虚拟内存」实验涉及 swap 概念。

## 八、面试题
1. swapon 之前为什么必须先 mkswap？
2. swap 头部签名的作用是什么？
3. 分区 swap 与文件 swap 优劣对比？

## 九、演进与趋势
早期仅支持分区；后来支持多个 swap 区域（含优先级），并加入 swap 槽位回收与 zswap 前置缓存。NVMe 普及后 swap 延迟下降，重新被重视用于弹性内存。

## 十、小结
swap 分区/swapfile 为匿名页提供磁盘归宿，mkswap+swapon 把它纳入内核的槽位管理体系，是内存超售与冷页外置的基础。
