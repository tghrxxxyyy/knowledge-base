# 中断向量表与IDT

> 对应 Intel SDM 卷3。

## 一、背景与挑战
CPU 必须在发生异常或中断时快速找到处理函数。实模式用 256 项中断向量表（IVT），保护/长模式用中断描述符表（IDT），需解决表位置、门类型与权限检查。

## 二、核心原理
IDT 含 256 个门描述符（中断门、陷阱门、任务门）。lidt 指令加载 IDTR（基址+界限）。中断发生时 CPU 用向量索引 IDT，做权限与类型检查后切换到对应特权级栈，压入上下文并跳到门中给出的段:偏移。中断门会清 IF，陷阱门不清。

## 三、形式化与数学基础
向量到处理函数的映射为函数：

$$ h = \text{IDT}[v].\text{handler},\quad v \in [0,256) $$

特权级切换条件：

$$ \text{if } \text{CPL} > \text{gate}.DPL \text{ then \#GP} $$

栈切换时按 TSS 中对应特权级栈段装载。

## 四、代码实现
设置 IDT 入口（x86-64 风格）：

```c
struct idt_entry {
    uint16_t off_low;
    uint16_t selector;
    uint8_t  ist;
    uint8_t  type_attr;
    uint16_t off_mid;
    uint32_t off_high;
    uint32_t reserved;
} __attribute__((packed));

void set_idt_gate(int v, void *handler, uint8_t type) {
    idt[v].off_low  = (uint64_t)handler & 0xffff;
    idt[v].off_mid  = ((uint64_t)handler >> 16) & 0xffff;
    idt[v].off_high = (uint64_t)handler >> 32;
    idt[v].selector = KERNEL_CS;
    idt[v].type_attr = type;  // 0x8E 中断门
}
```

## 五、与其他技术对比
实模式 IVT 每项仅 4 字节（段:偏移），无权限检查；保护模式 IDT 含特权与门类型，支持特权级切换。ARM 用异常向量表加 VBAR 寄存器实现类似机制，但向量数更少、处理方式不同。

## 六、常见误区
认为陷阱门与中断门等价，前者不清 IF 可被可屏蔽中断嵌套；忘记用户态触发中断门需 DPL=3；混淆向量号与 IRQ 号（经 PIC/APIC 映射后才对应）。

## 七、与开源书/权威来源对应
Intel SDM 卷3 第 6 章描述 IDT 与门；Linux 内核 arch/x86 下的 traps.c 与 idt.c 实现；CSAPP 第 8 章异常控制流对照用户态信号。

## 八、面试题
中断门与陷阱门差异；IDTR 作用；#GP 何时产生；IST 是什么。

## 九、演进与趋势
早期键盘异常与系统调用经 INT 指令，现代用 syscall/sysenter 快速系统调用，减少 IDT 依赖；FRED 等新机制进一步简化上下文切换。

## 十、小结
IDT 是保护/长模式下把中断与异常向量映射到处理函数的核心数据结构，门类型与 DPL 共同保证特权切换的安全，是异常处理与中断投递的入口。
