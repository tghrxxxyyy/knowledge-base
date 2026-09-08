> 对应 Linux 内核 Documentation（filesystems/）与 Silberschatz《Operating System Concepts》「File Caching」。

## 一、背景与挑战
文件 IO 若每次都访问磁盘，延迟与吞吐都不可接受。页缓存把文件数据缓存在物理内存的页中，使重复读与顺序读命中内存。挑战是组织「文件偏移 → 内存页」的映射，并统一文件页与匿名页的回收框架。

## 二、核心原理
每个文件 inode 关联一个 address_space（简称 mapping），它是「文件所有缓存页的中枢」。mapping 持有基树/每偏移到页的索引、以及一组操作（a_ops，如 readpage/writepage）。页缓存中的页用 page 描述，其 index 表示文件偏移（以页为单位）。同一页通过 page->mapping 指回 address_space，实现双向关联。

## 三、形式化与数学基础
设文件偏移 off，页大小 P。页索引：
```
index = off / P
```
缓存命中判定：
```
hit  <->  exists page p with (p->mapping == mapping) and (p->index == index)
miss <->  allocate new page, read from disk, insert into mapping
```
address_space 的 nrpages 统计缓存页数，radix/xarray 提供 O(log n) 查找（见下篇）。

## 四、代码实现
```c
// include/linux/fs.h（简化）
struct address_space {
    struct inode        *host;          // 所属 inode
    struct xarray        i_pages;        // 偏移->页 索引
    unsigned long        nrpages;        // 缓存页数
    const struct address_space_operations *a_ops;
};
// 读文件页（简化）
struct page *read_cache_page(struct address_space *mapping, pgoff_t index)
{
    page = find_get_page(mapping, index);
    if (!page) {
        page = alloc_page(GFP_KERNEL);
        mapping->a_ops->readpage(file, page);  // 从磁盘读入
        add_to_page_cache_lru(page, mapping, index);
    }
    return page;
}
```

## 五、与其他技术对比
- 无缓存：每读访问磁盘，慢。
- 页缓存（address_space）：按文件偏移索引，统一于 LRU。
- 缓冲区缓存（旧）：按块设备块号缓存，与页缓存在现代内核趋同（见第 6 篇）。

## 六、常见误区
- 误区：页缓存按 inode 编号查找。实际按 address_space 的偏移索引。
- 误区：页缓存只缓存读。写也先入页缓存（writeback 模式）。

## 七、与开源书/权威来源对应
- Silberschatz《Operating System Concepts》第 12 章文件缓存。
- Linux 内核 Documentation/filesystems/caching/ 描述页缓存。
- GitHub remzi-arpacidusse/ostep-code 的「file system」示例演示缓存。

## 八、面试题
1. address_space 的作用？
2. 页缓存中 page->index 表示什么？
3. 页缓存命中如何判定？

## 九、演进与趋势
早期用 radix tree 索引页；5.x 起迁移到 xarray（见下篇），统一了对页与子索引的管理，并支持更大规模缓存。

## 十、小结
address_space 是文件页缓存的中枢，把「文件偏移」映射到内存页，并统一接入 LRU 与 a_ops，是现代文件 IO 性能的核心。
