# GRUB2引导加载器原理

> 对应 Linux 内核 Documentation 与 GNU GRUB 手册。

## 一、背景与挑战
引导加载器需要跨文件系统读取内核镜像与 initramfs，再把 CPU 置于内核期望的状态（保护/长模式、页表就绪、命令行传递）后跳转。GRUB2 用模块化设计，把文件系统、视频、加密等驱动编译为可加载模块，避免把所有可能驱动塞进 MBR 的狭小空间。

## 二、核心原理
GRUB2 分三段：boot.img 放进 MBR 或 GPT 的 post-MBR gap，加载 core.img（含最小文件系统驱动），再由 core.img 加载 /boot/grub 下的模块与配置文件 grub.cfg。菜单选择后，linux 与 initrd 命令把内核与 initramfs 载入内存，boot 命令跳转到内核入口。GRUB2 支持通过 multiboot 规范引导多种内核。

## 三、形式化与数学基础
引导加载器需把物理地址映射到内核约定入口。64 位内核期望的跳转约定可用映射表示：

$$ \text{entry}(rax=0,\, rbx=\text{multiboot\_info\_addr},\, rip=\text{entry\_point}) $$

命令行参数以 C 字符串数组形式存放在约定内存区域，长度受协议头字段限制。

## 四、代码实现
grub.cfg 中典型的 Linux 启动项：

```grub
menuentry "Linux" {
    linux /boot/vmlinuz root=/dev/sda2 ro
    initrd /boot/initrd.img
}
```

内核头检测（简化）：

```c
struct linux_kernel_header {
    uint8_t  setup_sects;
    uint16_t root_flags;
    uint32_t cmd_line_ptr;
    uint64_t kernel_alignment;
    /* ... */
};
```

## 五、与其他技术对比
LILO 把磁盘块号硬编码进引导扇区，内核移动需重装；GRUB2 动态读文件系统更灵活。systemd-boot 更轻量但只支持 EFI 与单个分区。U-Boot 面向嵌入式，用环境变量而非复杂脚本。

## 六、常见误区
认为 GRUB2 只支持 Linux，它也能引导 Windows 与 multiboot 内核；认为修改 grub.cfg 一定危险，可先用 grub-reboot 临时项；认为 initramfs 可有可无，现代发行版常需它加载根文件系统驱动。

## 七、与开源书/权威来源对应
GNU GRUB 手册描述模块与脚本语法；Linux 内核 Documentation/x86/boot.rst 给出协议头定义；Hansimov/csapp 的加载笔记对照用户态 loader 概念。

## 八、面试题
GRUB2 三段各自职责；为什么需要 core.img；multiboot 的作用；initramfs 解决的问题。

## 九、演进与趋势
shim + GRUB2 的 Secure Boot 链条成为发行版标配；抗回滚与签名验证加强；Boot Loader Specification 让多个引导器共享同一配置目录。

## 十、小结
GRUB2 通过三段式与模块化把「在裸机上找到并启动内核」这一复杂任务分解为可维护的层次，是连接固件与操作系统内核的关键桥梁。
