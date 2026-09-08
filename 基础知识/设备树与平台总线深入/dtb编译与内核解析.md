> 对应 Linux 内核 Documentation（devicetree/booting-without-of.rst）与 ARMv8 手册。

## 一、背景与挑战
文本 DTS 不便由 bootloader/内核直接消费，需编译成紧凑二进制 DTB；内核要在启动早期、内存管理尚未完全就绪时解析它并建立设备模型。挑战是高效解析、早期内存可用、且与后续驱动 probe 衔接。

## 二、核心原理
dtc 把 DTS 编译为 DTB（含结构块、字符串块、内存保留块）。bootloader（如 U-Boot）加载 DTB 地址到约定寄存器/参数，跳内核。内核早期用 libfdt 或内建 unflatten 把 DTB 解析成 device_node 树（of_* API），再据此创建 platform_device 并触发驱动 probe。

## 三、形式化与数学基础
DTB 布局（概念）：
```
[ header | memory_reserve | dt_struct | dt_strings | free ]
```
header 含 magic（0xd00dfeed）、totalsize、off_dt_struct、off_dt_strings。解析复杂度：
```
unflatten: O(#nodes + #properties)   // 线性扫描结构块
```
device_node 父/子/兄弟指针构成内存树，与 DTB 的树同构。

## 四、代码实现
```c
// drivers/of/fdt.c（简化）
void unflatten_device_tree(void)
{
    // 从 dtb 物理地址解析
    of_alias_scan();                       // 处理 aliases
    __unflatten_device_tree(initial_boot_params, NULL, &of_root);
}
// 驱动用 of API 取属性
of_property_read_u32(np, "clock-frequency", &freq);
of_address_to_resource(np, 0, &res);      // 解析 reg 为资源
```

## 五、与其他技术对比
- 运行时枚举（PCI）：无需预描述。
- DTB 预编译：小巧、bootloader 易传递。
- ACPI 表：x86/ARM 服务器用，结构不同。

## 六、常见误区
- 误区：内核直接解析 DTS 文本。实际用编译后的 DTB 二进制。
- 误区：修改 DTS 后无需重编。必须 dtc 编译成 DTB 并重新部署。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/devicetree/booting-without-of.rst 讲 DTB 传递与解析。
- ARMv8 手册说明启动时内存与异常，为早期解析提供背景。
- GitHub CyC2018/CS-Notes 提及设备树启动流程。

## 八、面试题
1. DTS 与 DTB 的区别？
2. 内核如何拿到设备树起始地址？
3. unflatten 产出什么结构？

## 九、演进与趋势
早期用 ATAGS，后统一到 DTB（flattened device tree）；内核支持「早期 DTB 自带 + 运行时 overlay 叠加」，并引入 symbol 与 fixup 处理复杂板级差异。

## 十、小结
dtc 编译 DTS 为 DTB，内核早期 unflatten 成 device_node 树，是「文本描述→运行时设备模型」的桥梁。
