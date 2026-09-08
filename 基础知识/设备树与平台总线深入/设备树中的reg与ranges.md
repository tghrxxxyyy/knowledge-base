> 对应 Linux 内核 Documentation（devicetree/usage-model.rst）与 ARMv8 手册的「地址翻译」。

## 一、背景与挑战
设备寄存器散布在物理地址空间，且常嵌套在总线（如 soc、pci）之下。地址含义随「父总线地址宽度」变化。挑战是用 reg 表达设备资源、用 ranges 表达总线地址翻译，使内核正确把「设备树地址」映射为 CPU 物理地址。

## 二、核心原理
#address-cells 与 #size-cells 定义「地址/长度」用几个 32 位单元表示。reg = <地址 长度 [地址 长度]...>，其地址在父节点地址空间解释。ranges 在父总线节点上定义「子地址 → 父地址」的映射（如 soc 把 0x0 映射到 CPU 物理 0x40000000），无 ranges 表示 1:1。内核经 of_translate_address 沿父链翻译得到 CPU 物理地址。

## 三、形式化与数学基础
设父 ranges = <child_addr parent_addr size>。翻译：
```
cpu_addr = child_local_addr - child_base + parent_base   (在 [base, base+size) 内)
```
地址单元数由 #address-cells 决定。嵌套总线链式翻译：
```
dev_addr --(busA ranges)--> A_addr --(busB ranges)--> cpu_phys
```
of_address_to_resource 最终产出 struct resource{start=cpu_phys, ...}。

## 四、代码实现
```dts
/ {
    #address-cells = <2>;   // 64 位地址用 2 单元
    #size-cells = <2>;
    soc {
        #address-cells = <1>;
        #size-cells = <1>;
        ranges = <0x0 0x40000000 0x1000000>;  // 子0..0x1000000 -> CPU 0x40000000..
        uart0: serial@0 {
            reg = <0x0 0x1000>;   // 子空间 0x0 长度 0x1000
        };
    };
};
```
```c
// 内核翻译
of_address_to_resource(np, 0, &res);
// res.start = 0x40000000, res.end = 0x40000fff
```

## 五、与其他技术对比
- x86 PCI 配置空间：由 BIOS/ACPI 枚举，无需手动 ranges。
- DT reg/ranges：手动描述，适配固定 SoC 布局。
- 固定偏移硬编码：不可移植，DT 用声明式替代。

## 六、常见误区
- 误区：reg 地址就是 CPU 物理地址。它先在其父空间解释，可能经 ranges 翻译。
- 误区：#address-cells 随意设。父子必须一致理解，否则翻译错误。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/devicetree/usage-model.rst 讲地址翻译。
- ARMv8 手册描述物理地址与 MMIO 空间。
- GitHub CyC2018/CS-Notes 的「设备树」小节。

## 八、面试题
1. reg 中的地址是在哪个空间解释的？
2. ranges 的作用是什么？
3. of_address_to_resource 做了什么翻译？

## 九、演进与趋势
地址单元从 32 位（1 单元）到 64 位（2 单元）适配大地址；与 IOMMU 的 dma-ranges 结合，进一步描述设备视角总线地址与 CPU 物理地址的映射。

## 十、小结
reg 与 ranges 以声明方式表达设备寄存器资源与总线地址翻译，使内核能无歧义地把设备树地址解析为 CPU 物理地址。
