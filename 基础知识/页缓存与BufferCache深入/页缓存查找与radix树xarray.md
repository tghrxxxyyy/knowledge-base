> 对应 Linux 内核 Documentation（core-api/xarray.rst）与 Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战
页缓存可能含数百万页，必须用高效结构按偏移查找/插入/删除，且支持并发（RCU）。挑战是兼顾查找效率、内存紧凑与无锁读。

## 二、核心原理
历史上页缓存用 radix tree（基数树，按偏移的二进制位分层）索引；自 4.20/5.x 起迁移到 xarray——一个更通用、支持 RCU 安全的基数数组。xarray 以文件偏移为键，存 page 指针（或子 xarray 表示大页/分片）。查找为 O(log_B n)，插入/删除同样，且读路径可 RCU 无锁遍历。

## 三、形式化与数学基础
设键长为 k 位，每级扇出 B = 2^b。树高：
```
h = ceil(k / b)
```
操作复杂度：
```
lookup/insert/delete = O(h) = O(log_B n)
```
RCU 读：reader 不加锁，仅借 grace period 保证不被并发释放，适合「读远多于写」的缓存场景。

## 四、代码实现
```c
// 页缓存查找（现代 xarray 接口，简化）
struct page *find_get_page(struct address_space *mapping, pgoff_t offset)
{
    struct page *page;
    rcu_read_lock();
    page = xa_load(&mapping->i_pages, offset);   // RCU 无锁读
    if (page)
        get_page(page);                           // 提升引用
    rcu_read_unlock();
    return page;
}
// 插入
xa_store(&mapping->i_pages, offset, page, GFP_KERNEL);
```

## 五、与其他技术对比
- 哈希表：O(1) 但需预分配、易冲突、内存浪费。
- radix tree（旧）：功能等价但 API 较笨重。
- xarray（新）：RCU 安全、支持多值/子结构，统一替代 radix tree。
- 线性数组：O(1) 但稀疏文件浪费巨大内存。

## 六、常见误区
- 误区：查找必须加锁。读路径用 RCU 可无锁。
- 误区：radix tree 已被完全删除。其思想由 xarray 继承，旧代码仍有痕迹。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/core-api/xarray.rst 权威说明。
- Tanenbaum《Modern Operating Systems》讨论文件缓存索引结构。
- GitHub remzi-arpacidusse/ostep-code 的缓存示例。

## 八、面试题
1. 为什么页缓存用 xarray 而非普通哈希？
2. RCU 在查找中的作用？
3. xarray 相比旧 radix tree 的优势？

## 九、演进与趋势
xarray 统一了页缓存、IDR、以及大页（THP）的分片表示；与 DAX（直接访问持久内存）结合时绕过页缓存的路径也借助 xarray 管理映射。

## 十、小结
xarray（承袭 radix tree）以 RCU 安全的基数索引，为页缓存提供高效、紧凑、无锁读的偏移→页映射。
