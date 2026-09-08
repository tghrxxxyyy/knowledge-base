# BIOS与UEFI固件启动流程

> 对应 Intel SDM 卷3 与 UEFI 规范。

## 一、背景与挑战
x86 平台加电后 CPU 处于实模式，CS:IP 指向 0xFFFFFFF0 的复位向量，早期固件负责把处理器从 16 位实模式一路带到保护模式并加载引导加载器。传统 BIOS 用 16 位代码、1 MiB 地址空间限制与中断 0x19 磁盘读取，难以支撑大容量盘与安全启动。UEFI 以 32/64 位驱动模型、GPT 分区与 PE 格式的应用（EFI 应用）取代了这些限制，并引入 Secure Boot 的密钥校验链。

## 二、核心原理
复位后执行固件初始化（SEC 阶段做 CAR 缓存作为临时内存，PEI 阶段准备永久内存，DXE 阶段枚举设备并安装启动服务，BDS 阶段选择启动项）。引导加载器作为 EFI 应用被加载到物理内存，ExitBootServices 之后操作系统接管所有硬件。UEFI 用内存映射表把可用物理页交给内核。

## 三、形式化与数学基础
复位向量地址由 CS 段基址左移计算得到：

$$ \text{ResetAddr} = (\text{CS}_{base} \ll 4) + \text{IP} = 0xFFFF0000 + 0xFFF0 = 0xFFFFFFF0 $$

启动延迟可建模为各阶段耗时之和：

$$ T_{boot} = \sum_{i \in \{\text{SEC},\text{PEI},\text{DXE},\text{BDS},\text{OS}\}} t_i $$

## 四、代码实现
x86 复位后在 64 位长模式下的跳转示意（Intel 语法）：

```c
// 简化的 64 位内核入口跳转，由 bootloader 设定页表后调用
void __noreturn start_kernel(void) {
    setup_arch();
    parse_dt_or_acpi();   // 设备树或 ACPI 传递硬件信息
    mm_init();
    sched_init();
    rest_init();
}
```

## 五、与其他技术对比
BIOS 简单但受 1 MiB 与 16 位限制，盘启动依赖 INT 13h；UEFI 用协议接口与句柄数据库，支持大于 2 TiB 的 GPT 盘与网络启动。ARM 平台没有 BIOS/UEFI 的 x86 历史，通常用 Boot ROM 加 U-Boot 或 UEFI（EDK2）加设备树。

## 六、常见误区
认为 UEFI 一定比 BIOS 快，实际 DXE 驱动枚举可能更慢；认为 Secure Boot 等于加密磁盘，它只校验签名不加密内容；认为复位向量在 0xFFFFFFF0 处有可执行代码，实际那里通常是一条指向固件 ROM 的跳转。

## 七、与开源书/权威来源对应
Intel SDM 卷3 第 9 章给出复位与模式切换细节；UEFI 规范定义启动服务与运行时服务；Hansimov/csapp 仓库的链接与加载笔记可对照用户态 ELF 加载。Tanenbaum《Modern Operating Systems》第 2 章概述启动。

## 八、面试题
解释从按下电源到内核 start_kernel 的控制流；UEFI 与 BIOS 的核心区别；为什么需要 ExitBootServices；Secure Boot 防的是什么攻击。

## 九、演进与趋势
ARM 的 PSCI 接管电源管理，ACPI 取代大量固件特定接口；机密计算引入固件度量与 DRTM；RISC-V 用 OpenSBI 作为 Supervisor 二进制接口层。固件正走向可度量启动（measured boot）与 Rust 实现以降低漏洞面。

## 十、小结
启动是从复位向量经 SEC/PEI/DXE/BDS 把控制权交给引导加载器再到内核的过程；UEFI 以协议、GPT 与安全启动解决了 BIOS 的结构性限制，但概念上仍承担「把硬件变成抽象资源」的同一职责。
