> 对应 Linux 内核 Documentation（devicetree/overlay-notes.rst）与 ARMv8 手册背景。

## 一、背景与挑战
同一主板可能插不同扩展板（cape、HAT、FPGA 子卡），硬件在出厂后才知道。重编整套 DTB 不灵活。挑战是允许在运行时把「增量硬件描述」叠加到已加载的设备树之上，动态增删设备节点并触发驱动探测。

## 二、核心原理
DT overlay 是一段「片段（fragment）」：每个 fragment 用 target（标签或 phandle）指向基础树某节点，target 下挂要新增/修改的内容。内核（或 bootloader/U-Boot）将 overlay 的 DTB 与基础 DTB 合并，生成新 device_node 树，新增节点经 of_platform_populate 触发驱动 probe；移除 overlay 则卸载对应设备。

## 三、形式化与数学基础
设基础树 T，overlay 片段集合 F，每个 f ∈ F 含 (target_node, delta_subtree)。合并：
```
T' = T ∪ { attach(delta_subtree_f, target_node_f) for f in F }
```
符号解析：overlay 用 &label 引用基础树标签，要求基础 DTB 编译时保留 symbol（__symbols__ 节点）。冲突检测：同标签/同名节点需一致或显式覆盖。

## 四、代码实现
```dts
// overlay 示例
/dts-v1/;
/plugin/;
&i2c1 {                        // 指向基础树 i2c1 标签
    sensor@48 {
        compatible = "vendor,temp-sensor";
        reg = <0x48>;
        status = "okay";
    };
};
```
```c
// 内核应用 overlay
of_overlay_create(overlay_fdt);    // 合并并触发 probe
of_overlay_destroy(id);            // 卸载并移除设备
```

## 五、与其他技术对比
- 重编完整 DTB：静态、需重启/重烧写。
- DT overlay：运行时增量、热插拔友好。
- ACPI SSDT overlay：x86/服务器侧的动态表叠加类比。

## 六、常见误区
- 误区：overlay 可随意覆盖任意节点。需基础树保留 symbol 且目标存在。
- 误区：overlay 是脚本。它是 DTB 片段，仍需 dtc 编译。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/devicetree/overlay-notes.rst 权威描述。
- ARMv8 手册提供扩展硬件背景。
- GitHub CyC2018/CS-Notes 提及 overlay 概念。

## 八、面试题
1. overlay 如何引用基础树的节点？
2. 为什么基础 DTB 需要保留 symbol？
3. 移除 overlay 会发生什么？

## 九、演进与趋势
U-Boot 支持「运行时应用 overlay」以适配多扩展板；内核 configfs 接口允许从用户态加载 overlay，配合 FPGA/可重构硬件形成动态设备描述生态。

## 十、小结
DT overlay 以片段化增量描述扩展硬件，运行时合并进设备树并触发驱动探测，实现了嵌入式平台的热插拔式硬件描述。
