# Local APIC与IO APIC架构

> 对应 Intel SDM 卷3。

## 一、背景与挑战
SMP 系统需要把中断精确投递到目标 CPU，并支持优先级与嵌套。传统 PIC 无法路由到特定处理器，APIC（高级可编程中断控制器）以本地与 I/O 两部分解决了多处理器中断分发。

## 二、核心原理
每个 CPU 有 Local APIC，负责接收中断、维护 TPR/PPR 优先级与发送 IPI。I/O APIC 接收设备中断，按重定向表项（RTE）决定目标 CPU、向量与触发方式，通过系统总线发往目标 Local APIC。xAPIC 用 MMIO，x2APIC 用 MSR 扩展地址位。

## 三、形式化与数学基础
重定向表项决定投递函数：

$$ \text{deliver}(irq) \to (\text{vector}, \text{CPU}_{dest}, \text{mode}, \text{polarity}) $$

目标由目标模式与位掩码或逻辑/簇 ID 决定。优先级仲裁满足：

$$ \text{ISR} \subseteq \text{bitmap},\quad \text{PPR} = \max\{\text{ISR 中已设位优先级}, \text{TPR}\} $$

## 四、代码实现
读 Local APIC 寄存器（xAPIC MMIO）：

```c
#define LAPIC_BASE 0xFEE00000
static inline u32 lapic_read(u32 reg) {
    return *(volatile u32 *)(LAPIC_BASE + reg);
}
static inline void lapic_send_ipi(u32 apic_id, u8 vector) {
    *(volatile u32 *)(LAPIC_BASE + 0x310) = (apic_id << 24);
    *(volatile u32 *)(LAPIC_BASE + 0x300) = vector;
}
```

## 五、与其他技术对比
Local APIC 是每个核的中断终点，I/O APIC 是设备中断汇聚与路由；MSI 让设备直接写 Local APIC 寄存器，跳过 I/O APIC 的表查找；旧 PIC 无每核概念。APIC 是 x86 SMP 中断的事实标准。

## 六、常见误区
认为 I/O APIC 决定中断在哪个核处理，实际由 RTE 目标字段指定；混淆 xAPIC 与 x2APIC，后者可寻址更多 CPU；忽略 TPR 会屏蔽低优先级中断导致丢中断。

## 七、与开源书/权威来源对应
Intel SDM 卷3 第 10 与 11 章是权威来源；Linux 内核 Documentation/IRQ-affinity.txt 描述亲和设置；Hennessy & Patterson 讨论多处理器互连。

## 八、面试题
Local 与 I/O APIC 分工；重定向表项内容；IPI 用途；xAPIC 与 x2APIC 区别。

## 九、演进与趋势
x2APIC 支持更大规模系统；虚拟 APIC 与 posted interrupt 优化虚拟化开销；I/O APIC 逐渐被 MSI/MSI-X 边缘化。

## 十、小结
APIC 把中断控制器分布到每核 Local APIC 与集中式 I/O APIC，通过重定向表与 IPI 实现 SMP 下的精确中断路由，是现代 x86 多处理器中断的基础。
