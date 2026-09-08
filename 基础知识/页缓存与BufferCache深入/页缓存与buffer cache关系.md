> 对应 Tanenbaum《Modern Operating Systems》「File Cache」与 Linux 内核 Documentation（filesystems/）。

## 一、背景与挑战
历史上 Unix 区分「页缓存」（缓存文件页）与「缓冲区缓存」（缓存块设备的裸块，如文件系统元数据、裸设备 IO）。两套缓存并存会导致同一数据在内存中出现两份、不一致。挑战是统一它们。

## 二、核心原理
现代 Linux 已将二者统一：buffer cache 不再是独立缓存，而是「页缓存中那些代表磁盘块（buffer head 描述）的页」。也即，块设备的 IO 也通过页缓存完成，一个页可同时作为文件页与若干 buffer 的载体。buffer_head 仅描述「页内某段对应哪个磁盘块」，页本身仍由 address_space 管理。这样消除了重复缓存与一致性问题。

## 三、形式化与数学基础
设磁盘块 b 映射为文件/设备偏移 off_b。缓存归属：
```
buffer_cache_entry(b)  ⊂  page_cache_page(off_b / P)
```
即缓冲区是页缓存页的「子视图」。引用计数兼顾「页级」与「块级」：
```
page->_refcount  (页被引用)
page->private -> buffer_head 链表（块级引用）
```
释放页前需块级引用归零，避免正在写回的块被误回收。

## 四、代码实现
```c
// fs/buffer.c（简化）
struct buffer_head {
    sector_t  b_blocknr;        // 磁盘块号
    struct page *b_page;        // 所属页缓存页
    void *b_data;               // 页内偏移指针
    atomic_t b_count;           // 块级引用
};
// 获取块对应的缓存页
struct buffer_head *__getblk(struct block_device *bdev, sector_t block, int size)
{
    page = find_get_page(bdev->bd_inode->i_mapping, block * size / PAGE_SIZE);
    if (!page) page = grow_buffers(...);   // 经页缓存分配
    return attach_buffer_head(page, block);
}
```

## 五、与其他技术对比
- 早期 Unix：两套独立缓存，需一致性协议。
- 现代 Linux：统一到页缓存，buffer head 仅作块描述符。
- 其他系统（如某些 BSD）：仍有独立 buffer cache 概念。

## 六、常见误区
- 误区：Linux 仍有两个独立缓存。自 2.4 起 buffer cache 已并入页缓存。
- 误区：buffer_head 是缓存本身。它只是页内块的描述/引用，数据在页里。

## 七、与开源书/权威来源对应
- Tanenbaum《Modern Operating Systems》讨论 buffer vs page cache 历史。
- Linux 内核 Documentation/filesystems/caching/ 说明统一缓存。
- GitHub CyC2018/CS-Notes 的「文件系统」小节提及二者关系。

## 八、面试题
1. 现代 Linux 中 buffer cache 还是独立缓存吗？
2. buffer_head 的作用是什么？
3. 统一缓存解决了什么问题？

## 九、演进与趋势
buffer_head 逐渐被更现代的 iomap 抽象替代（用于写路径），但作为块级引用机制仍广泛存在于读/元数据路径；页缓存始终为统一中枢。

## 十、小结
现代 Linux 把 buffer cache 并入页缓存，buffer_head 仅描述页内块映射，彻底消除了双缓存的不一致，是文件缓存架构的重要简化。
