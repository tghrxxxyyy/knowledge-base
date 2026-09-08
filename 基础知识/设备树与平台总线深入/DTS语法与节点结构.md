> 对应 Linux 内核 Documentation（devicetree/）与 ARMv8 手册的「系统地址」背景。

## 一、背景与挑战
ARM 等平台没有 x86 那样的 PC BIOS 自动枚举设备，硬件布局需由内核静态或固件描述。挑战是用一种与具体内核代码解耦的文本/二进制描述硬件拓扑，使同一内核镜像适配不同板子。

## 二、核心原理
设备树源（DTS）是树状结构，根节点「/」下挂子节点表示总线与设备。每个节点有属性（property）：如 compatible（匹配驱动）、reg（寄存器地址）、interrupts（中断）、status 等。节点通过「标签 + &引用」建立关联。编译后成 DTB 由 bootloader 传给内核，内核解析生成 device_node 树。

## 三、形式化与数学基础
设备树是带标签的有根树 T=(V,E)，每节点 v 含属性集合 A(v)。驱动匹配是字符串集合交：
```
match(drv, node) <-> exists c in drv.compatible_list : c ∈ node.compatible
```
父-子关系定义地址空间嵌套：子节点的 reg 在其父地址空间内解释（见 reg/ranges 篇）。

## 四、代码实现
```dts
// 示例 DTS 片段
/dts-v1/;
/ {
    #address-cells = <1>;
    #size-cells = <1>;
    soc {
        compatible = "simple-bus";
        #address-cells = <1>;
        #size-cells = <1>;
        uart0: serial@4000 {
            compatible = "vendor,uart-1";
            reg = <0x4000 0x1000>;
            interrupts = <5>;
            status = "okay";
        };
    };
};
```

## 五、与其他技术对比
- x86 ACPI/PCI 枚举：硬件自描述，无需静态树。
- 设备树 DTS：显式描述，适配无枚举能力的嵌入式平台。
- 硬编码 platform data：与内核耦合，难移植。
- ACPI（ARM 服务器）：ARM 服务器趋向 ACPI，但嵌入式仍用 DT。

## 六、常见误区
- 误区：设备树是驱动代码。它只是数据，不含可执行逻辑。
- 误区：compatible 任意写。它必须和驱动 of_match_table 中字符串一致才能匹配。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/devicetree/bindings/ 规定各硬件 binding。
- ARMv8 手册描述地址空间，为 reg/ranges 提供硬件背景。
- GitHub CyC2018/CS-Notes 的「设备树」背景小节。

## 八、面试题
1. 设备树节点如何被驱动匹配？
2. compatible 属性的作用？
3. 为什么 ARM 比 x86 更依赖设备树？

## 九、演进与趋势
从板级 DTS 到「.dtsi 复用 + overlays 动态叠加」（见第 6 篇）； bindings 规范化由 dt-schema 校验，减少人为错误。

## 十、小结
DTS 用树状节点与属性描述硬件拓扑，compatible 驱动匹配，使内核与具体板级硬件解耦，是 ARM 嵌入式可移植性的基石。
