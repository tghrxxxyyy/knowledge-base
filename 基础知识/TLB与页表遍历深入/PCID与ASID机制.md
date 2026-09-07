# PCID 与 ASID 机制

> 对应 Intel SDM 卷3（PCID）与 ARM 厂商手册（ASID）说明。

## 一、背景与挑战
进程频繁切换时若每次都全刷 TLB，代价极高且破坏局部性。PCID（x86）/ASID（ARM）给每次地址空间一个短标签，使不同空间的 TLB 项可共存。

## 二、核心原理
TLB 表项额外存储 PCID/ASID 标签。查找时仅当 VA 标签与当前 PCID 均匹配才命中。切换进程时若目标 PCID 已驻留，可不清 TLB，仅切换 CR3 的 PCID 字段。

## 三、形式化与数学基础
设 TLB 容量 $T$，共存地址空间数 $K$，每空间有效容量约 $T/K$。切换成本由是否需全刷决定：
$$Cost_{switch} = \begin{cases} 0 & PCID_{new} \in TLB \\ Flush(T) & \text{全刷} \end{cases}$$
上下文切换吞吐提升正比于免刷比例。

## 四、代码实现
```c
// PCID避免全刷的开关
void switch_mm(int new_pcrd) {
    // 仅设置CR3的PCID域, 不清TLB
    unsigned long cr3 = read_cr3();
    cr3 = (cr3 & ~0xFFF) | (new_pcrd & 0xFFF);
    write_cr3(cr3);
    // 旧空间TLB项因PCID不同而自然不命中
}
```

## 五、与其他技术对比
无 PCID 必须全刷（或软件选择性失效）；PCID 以小标签换取 TLB 共存。但 PCID 数量有限（x86 为 12 位 = 4096），需回收。

## 六、常见误区
误以为 PCID 无限：耗尽需回收并刷对应项。误以为 ASID 等同于 PID：它是映射后的短标签。

## 七、与开源书/权威来源对应
Intel SDM 卷3 PCID 小节；ARMv8 手册 ASID；Linux 内核 Documentation。

## 八、面试题
问：PCID 为何能避免 TLB 全刷？答：TLB 项带标签，仅匹配当前标签。

## 九、演进与趋势
PCID 结合 INVPCID 指令做精细失效；虚拟机下 EPTP 标签隔离 guest。

## 十、小结
PCID/ASID 是廉价保存 TLB 状态的关键技术，让频繁上下文切换几乎零 TLB 代价。
