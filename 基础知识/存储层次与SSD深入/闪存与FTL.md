# 闪存与FTL

> 对应 OSTEP https://github.com/remzi-arpacidusse/ostep-code （持久存储章）；闪存原理公开资料定性。

## 一、背景与挑战

NAND 闪存不可原地改写：写前须擦除整个块(数十 KB)，且擦除次数有限。需 FTL(闪存转换层)把逻辑块映射为物理页，对上呈现类磁盘。

## 二、核心原理

FTL 维护 LBA→PPA 映射。写入采用“异地更新(out-of-place)”：新写新页，旧页标记无效；块满后 GC 回收无效页并擦除。读直接按映射。页不可覆盖，故更新即写新页。

## 三、形式化 / 数学基础

擦除粒度 $Block \gg Page$。异地更新导致有效页需搬移：

$$ValidMove = \sum_{valid\ in\ victim} PageSize$$

写放大正比于有效页比例与 GC 频率。

## 四、代码实现

```c
// FTL 映射表（简化）：逻辑页 -> 物理页
uint32_t ftl[LBA_COUNT];
void write(uint32_t lba, void *data) {
    uint32_t ppa = alloc_page();     // 异地分配
    nand_program(ppa, data);
    ftl[lba] = ppa;                  // 更新映射
    mark_invalid(old_ppa);
}
```

## 五、与其他技术对比

- 异地更新避免擦除阻塞；代价是 GC 与写放大。
- 与磁盘原地写不同，SSD 必须 FTL。

## 六、常见误区

- 误以为 SSD 可覆盖写：须擦块，实际异地。
- 忽视 TRIM 对 GC 的帮助。

## 七、与开源书 / 权威来源对应

- OSTEP：https://github.com/remzi-arpacidusse/ostep-code
- CSAPP 中文笔记：https://github.com/Hansimov/csapp

## 八、面试题

- 为何 SSD 不能覆盖？答：编程以页、擦除以块，须先擦后写。
- FTL 作用？答：LBA→PPA 映射，隐藏异地更新。

## 九、演进与趋势

Open-Channel / ZNS 把 FTK 交给主机，降低写放大与延迟。

## 十、小结

FTL 以异地更新与 GC 把不可改写的闪存伪装成块设备，代价是写放大。
