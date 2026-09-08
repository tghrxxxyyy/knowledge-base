# 设备树与ACPI硬件描述

> 对应 ARMv8 手册 与 Linux 内核 Documentation。

## 一、背景与挑战
内核需要获知板级硬件拓扑（CPU、内存、中断控制器、时钟、总线设备），但把这些写死在内核里会导致每个板子一个内核。设备树（DT）与 ACPI 提供数据驱动的硬件描述，让同一内核镜像适配不同平台。

## 二、核心原理
设备树是描述硬件的树状数据结构，编译为 DTB 由引导加载器传给内核，内核用 of_* 接口按节点与 compatible 字符串匹配驱动。ACPI 以表（RSDP→RSDT/XSDT→FADT/DSDT 等）描述平台，含 AML 字节码由解释器执行，主要见于 x86 服务器与笔记本。

## 三、形式化与数学基础
设备树可视为有根树 $T=(V,E)$，节点 $v \in V$ 带属性集合 $\text{props}(v)$。驱动匹配是关系：

$$ \text{match}(d, v) \iff \text{compatible}(v) \cap \text{of\_match\_table}(d) \neq \varnothing $$

ACPI 命名空间则是带路径的对象树，由 \_SB 等作用域标识。

## 四、代码实现
设备树片段与解析：

```dts
uart0: serial@4000 {
    compatible = "ns16550a";
    reg = <0x4000 0x1000>;
    interrupts = <0 12 4>;
    clock-frequency = <24000000>;
};
```

```c
static const struct of_device_id uart_match[] = {
    { .compatible = "ns16550a" },
    {}
};
```

## 五、与其他技术对比
DT 适合静态嵌入式板级描述，源码可读；ACPI 适合动态、可枚举的通用平台并支持电源管理对象。x86 传统用 ACPI，ARM 服务器趋向 ACPI，嵌入式 ARM 仍多用 DT。两者都避免把硬件细节硬编码进内核。

## 六、常见误区
认为 DT 是固件与内核的驱动代码，实际 DT 只描述数据；认为 ACPI 仅用于电源管理，它也描述设备拓扑；把 compatible 字符串当任意文本，驱动匹配严格依赖它。

## 七、与开源书/权威来源对应
ARMv8 手册描述异常与内存模型，配合 DT 使用；Linux 内核 Documentation/devicetree/ 给出绑定规范；Tanenbaum《Modern Operating Systems》讨论硬件抽象层。

## 八、面试题
DT 与 ACPI 的设计哲学差异；compatible 匹配流程；AML 是什么；为什么需要 DTB 由 bootloader 传入。

## 九、演进与趋势
Device Tree 叠加（DTBO）支持运行时硬件变体；ACPI 在 ARM 服务器标准化；机密虚拟机用特殊表传递安全配置。

## 十、小结
设备树与 ACPI 都把硬件拓扑从内核代码中剥离为数据，前者以静态树描述板级硬件，后者以表与 AML 描述通用平台，是内核实现跨平台可移植的核心机制。
