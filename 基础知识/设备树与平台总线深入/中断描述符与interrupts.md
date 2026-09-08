> 对应 Linux 内核 Documentation（devicetree/interrupts.txt）与 ARMv8 手册的「中断控制器」。

## 一、背景与挑战
设备中断线连接到中断控制器（如 GIC），控制器把硬件中断号翻译为内核 IRQ。设备树需描述「设备用哪个中断、何种触发类型」，并经由中断控制器层级映射。挑战是表达中断控制器级联与设备中断规格。

## 二、核心原理
 interrupt-controller 节点声明自身为中断控制器，含 #interrupt-cells 定义中断描述符长度。设备节点用 interrupts = <控制器相关描述> 与 interrupt-parent 指向上游控制器。描述符语义取决于控制器 binding：GIC 下通常为 <type spi/ppi, 硬件号, 触发标志>。内核用 irq_domain 把「设备树中断说明符」映射为 Linux 虚拟 IRQ。

## 三、形式化与数学基础
设中断说明符为元组 t = (cells...)。irq_domain 提供映射：
```
hwirq = controller.translate(t)        // 由 cells 算出硬件中断号
virq  = irq_domain_alloc_irq(virq_base, hwirq)
```
级联：若控制器 A 的上游是 B，则 A 的 hwirq 经 B 再翻译，形成「设备 → A → B → CPU」的级联链。触发类型位：
```
IRQ_TYPE_EDGE_RISING | IRQ_TYPE_LEVEL_HIGH | ...
```

## 四、代码实现
```dts
/ {
    intc: interrupt-controller@1e000000 {
        compatible = "arm,gic-400";
        #interrupt-cells = <3>;
        interrupt-controller;
    };
    uart0: serial@4000 {
        interrupt-parent = <&intc>;
        interrupts = <0 5 4>;   // SPI, hwirq=5, 触发=4(LEVEL_HIGH)
    };
};
```
```c
// 内核侧映射
irq = irq_of_parse_and_map(np, 0);     // 得到 virq
request_irq(irq, handler, 0, "uart", dev);
```

## 五、与其他技术对比
- x86 固定向量/ACPI：中断多由固件枚举。
- DT interrupts + irq_domain：显式描述 + 软件翻译。
- GPIO 中断：需额外 gpio-controller 与 interrupt nexus 映射。

## 六、常见误区
- 误区：interrupts 的数字就是 Linux IRQ 号。它是控制器相对说明符，须经 irq_domain 翻译为 virq。
- 误区：所有控制器 cells 含义相同。语义由各自 binding 定义。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/devicetree/bindings/interrupt-controller/ 定义 GIC binding。
- ARMv8 手册的 GIC 章节描述中断类型与路由。
- GitHub CyC2018/CS-Notes 的「中断」小节背景。

## 八、面试题
1. interrupts 中的数字是否等于 Linux IRQ？
2. irq_domain 的作用？
3. interrupt-parent 何时可省略？

## 九、演进与趋势
从简单 GIC 到 GICv3 的 ITS（基于消息的中断），设备树增加 msi-parent 等描述；级联与 IRQ 栈虚拟化使映射更复杂但仍由 irq_domain 抽象。

## 十、小结
interrupts 与 irq_domain 把设备树中的中断说明符翻译为内核虚拟 IRQ，配合中断控制器级联，统一了异构平台的中断描述。
