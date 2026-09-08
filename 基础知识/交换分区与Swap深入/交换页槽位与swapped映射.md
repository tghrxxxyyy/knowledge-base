> 对应 Silberschatz《Operating System Concepts》「Swapping」与 Linux 内核 Documentation（mm/swapfile.c 注释）。

## 一、背景与挑战
一个匿名页被换出后，内核必须能「凭 PTE 找到它在磁盘的哪一槽位」，否则无法换入。挑战是设计一种紧凑的标识，把「页在 swap 中的位置」编码进原本用于指向物理帧的页表项。

## 二、核心原理
换出页的 PTE 不指向物理帧，而是设为「present=0 且 非 none」，并编码一个 swap entry：由 swap 类型（type，标识哪块 swap 区域）与偏移（offset，槽位号）组成。页表项的低位保留给标志，高位容纳 type/offset。内核用 swp_entry(type, offset) 与 pte_to_swp_entry 互转。

## 三、形式化与数学基础
设页表项位宽为 B（通常 64 用于 x86-64 的 PTE 软件位），swap entry 编码：
```
swp_entry = (type << OFFSET_BITS) | offset
offset ∈ [0, 2^OFFSET_BITS)
type   ∈ [0, MAX_SWAPFILES]  (受 SWAP_ADDRESS_SPACE 限制)
```
换入时：entry = pte_to_swp_entry(pte); 读 swap_info[type] 的槽位 offset 得到磁盘位置。区分「none PTE（未映射）」与「swapped PTE（在磁盘）」靠 present 位与特殊标志位组合。

## 四、代码实现
```c
// include/linux/swapops.h（简化）
static inline swp_entry_t swp_entry(unsigned long type, pgoff_t offset)
{
    swp_entry_t ret;
    ret.val = (type << SWP_TYPE_SHIFT) | offset;
    return ret;
}
static inline pte_t swp_entry_to_pte(swp_entry_t entry)
{
    pte_t pte;
    pte.val = entry.val;            // present 位为 0，标志位标记 swapped
    return pte;
}
```

## 五、与其他技术对比
- 页表直指物理帧：present=1，快速但无磁盘位置信息。
- swap entry：present=0，携带磁盘位置，换入时解析。
- 反向映射：回收时由页找 PTE；swap entry 是回收后 PTE 的新含义。

## 六、常见误区
- 误区：被换出的页 PTE 是空的。实际它是「swapped 编码」而非 none。
- 误区：swap entry 只在匿名页出现。shmem/tmpfs 同样用 swap entry 表示外置页。

## 七、与开源书/权威来源对应
- Silberschatz《Operating System Concepts》讨论页表项如何表示换出页。
- Linux 内核 mm/swapfile.c 与 include/linux/swapops.h 定义编码。
- GitHub xiaolincoder 的「内存」图解说明 PTE 的 swapped 状态。

## 八、面试题
1. 被换出的页，其 PTE 的 present 位是 0 还是 1？
2. swap entry 由哪两部分构成？
3. 如何区分「未映射」与「已换出」两种 PTE？

## 九、演进与趋势
x86-64 的 PTE 软件可用位使得 swap entry 能容纳较大 offset；THP 的 swap 集群分配（swap cluster）让连续大块换出更高效，并支持 swap 的批量预读。

## 十、小结
swap entry 把「磁盘槽位坐标」编码进 PTE，使换入路径能无歧义地定位外置页，是 swap 机制正确性的核心编码设计。
