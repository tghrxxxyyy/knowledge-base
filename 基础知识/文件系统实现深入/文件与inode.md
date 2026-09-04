# 文件与inode

> 对应 OSTEP 第 39-40 章“文件系统”与 Linux `fs/inode.c`。

## 一、背景与挑战
文件系统需将“文件名”映射到磁盘上的数据块，并保存权限、大小、时间戳等元数据。inode 模式把元数据与数据分离管理。

## 二、核心原理
- inode 保存元数据：权限、属主、大小、时间戳、数据块指针。
- 目录项（dentry）把“名字→inode 号”关联；硬链接共享同一 inode。
- 数据块指针采用直接/一级/二级/三级间接，支持大文件。

## 三、形式化 / 数学基础
设块大小 $B$，指针数：直接 $d$，单间接指向 $B/4$ 个块。最大文件：
$$S_{max}=d\\cdot B + \\frac{B}{4}B + \\left(\\frac{B}{4}\\right)^2 B + \\left(\\frac{B}{4}\\right)^3 B$$
（以 4 字节指针计）。

## 四、代码实现
读取 inode 的第 `blk` 个逻辑块号（简化间接）：

```c
uint32_t bmap(struct inode *i, uint32_t blk) {
    if (blk < 12) return i->blocks[blk];
    blk -= 12;
    if (blk < 256) return indir(i->ind1, blk);
    blk -= 256;
    if (blk < 256*256) return indir2(i->ind2, blk);
    return indir3(i->ind3, blk - 256*256);  /* 三级 */
}
```

## 五、与其他技术对比
inode 式（Unix）元数据集中、硬链接自然；FAT 用文件分配表链式无 inode；NTFS 用 MFT 记录，思路类似但结构不同。

## 六、常见误区
- 认为文件名在 inode 里：名字只在目录项中，inode 不含名。
- 混淆硬链接与软链接：硬链接同 inode，软链接是独立文件存路径。
- 忽略 inode 耗尽（文件数达上限）即便磁盘未满。

## 七、与开源书 / 权威来源对应
- OSTEP 文件系统代码：https://github.com/remzi-arpacidusse/ostep-code
- CS-Notes：https://github.com/CyC2018/CS-Notes

## 八、面试题
1. 硬链接与软链接区别？
2. 三级间接能支持多大文件（给块大小）？
3. 文件名存在哪里？

## 九、演进与趋势
ext4 的 extent（区间）取代间接块，减少大文件元数据量；btrfs/zfs 用树结构管理。

## 十、小结
inode 将元数据与数据解耦：目录项做名字→inode 映射，inode 用多级指针定位数据块，是 Unix 文件系统基石。
