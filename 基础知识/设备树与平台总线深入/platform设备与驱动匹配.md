> 对应 Linux 内核 Documentation（driver-model/platform.rst）与 Silberschatz 设备驱动背景。

## 一、背景与挑战
非 PCI/USB 这类能自动枚举的设备（如 SoC 内部 UART、看门狗、定时器）需要内核显式注册为 platform 设备。挑战是把「设备（来自设备树/板级）」与「驱动」按规则匹配并触发 probe。

## 二、核心原理
platform 总线是一种「伪总线」，用于无自枚举能力的设备。设备侧（device_node 经 of_platform_populate 转为 platform_device）与驱动侧（platform_driver 含 of_match_table）通过 compatible 字符串匹配。匹配成功调用 probe，分配资源（reg/irq 经 of 解析为 struct resource）。匹配次序：of_match → acpi → id_table → name。

## 三、形式化与数学基础
匹配函数（优先级降序）：
```
match(d, dev) =
   of_match_table contains dev.compatible   ? OF
 : acpi_match(dev)                          ? ACPI
 : id_table contains dev.name               ? ID
 : strcmp(d.name, dev.name)==0              ? NAME
 : NONE
```
probe 触发条件：∃ 匹配 → 调用 d->probe(pdev)，返回 0 表示绑定成功。

## 四、代码实现
```c
// 驱动侧（简化）
static const struct of_device_id my_uart_of[] = {
    { .compatible = "vendor,uart-1" },
    { }
};
static struct platform_driver my_uart_drv = {
    .probe  = my_uart_probe,
    .remove = my_uart_remove,
    .driver = { .name = "myuart", .of_match_table = my_uart_of },
};
// 设备侧由 of_platform_populate 从 device_node 创建 platform_device
// probe 中取资源
static int my_uart_probe(struct platform_device *pdev)
{
    struct resource *r = platform_get_resource(pdev, IORESOURCE_MEM, 0);
    void __iomem *base = devm_ioremap(&pdev->dev, r->start, resource_size(r));
    return 0;
}
```

## 五、与其他技术对比
- PCI 总线：设备自报 VID/DID，自动枚举。
- platform 总线：无枚举，靠 compatible/name 静态匹配 SoC 内部设备。
- USB/SCSI：各自枚举协议，platform 不覆盖。

## 六、常见误区
- 误区：platform 是真实硬件总线。它是软件抽象，用于「不能枚举」的设备。
- 误区：compatible 不匹配也能 probe。必须 of_match_table 命中才触发。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/driver-model/platform.rst 权威描述。
- Silberschatz《Operating System Concepts》设备驱动章节提供背景。
- GitHub CyC2018/CS-Notes 的「驱动模型」小节。

## 八、面试题
1. platform 总线与 PCI 总线本质区别？
2. of_match_table 如何参与匹配？
3. probe 失败返回值意味着什么？

## 九、演进与趋势
从板级 platform_device 硬编码到设备树自动 populate；与组件模型（component）、deferred probe 配合处理设备间依赖顺序。

## 十、小结
platform 总线用 compatible 字符串把「设备树描述的 SoC 设备」与「驱动」匹配并 probe，是嵌入式无枚举设备接入内核的统一机制。
