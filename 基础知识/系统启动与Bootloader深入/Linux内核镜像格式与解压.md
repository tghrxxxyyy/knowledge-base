# Linux内核镜像格式与解压

> 对应 Bryant & O'Hallaron《CSAPP》与 Hansimov/csapp。

## 一、背景与挑战
内核镜像要在小内存环境下被引导加载器载入并自解压到高位地址，同时保留被压缩的代码与运行所需的最小头信息。不同格式（vmlinux、zImage、bzImage、vmlinuz）对应不同的压缩与加载约定，混淆它们会导致启动失败。

## 二、核心原理
vmlinux 是未压缩的 ELF 内核；zImage 是经 gzip 压缩并自带解压 stub 的镜像；bzImage（big zImage）可放在高端内存，由 bootloader 载入后由内置解压代码搬到最终运行地址再跳转。解压 stub 先把自身与压缩数据搬离目标区，再解压，最后跳到真正的入口。

## 三、形式化与数学基础
压缩率定义为原始与压缩大小之比：

$$ r = \frac{|K_{orig}|}{|K_{compressed}|} $$

解压需满足目标区与压缩数据不重叠：

$$ [\text{load}, \text{load}+|K_{orig}|) \cap [\text{cdata}, \text{cdata}+|K_{compressed}|) = \varnothing $$

## 四、代码实现
内核自解压入口（arch/x86/boot/compressed 简化）：

```c
asmlinkage void decompress_kernel(void) {
    // 把压缩镜像搬到安全位置
    memcpy(output, input, compressed_size);
    // 调用对应解压算法（gzip/lz4/zstd 等）
    gunzip(output, output_len, input, input_len);
    // 跳转到解压后的真实入口
    enter_kernel();
}
```

## 五、与其他技术对比
vmlinux 便于调试但体积大；bzImage 利于网络/磁盘传输；UEFI 平台可用 vmlinuz.efi 直接作为 EFI 应用，省去额外的 bootloader 解压层。对比用户态可执行，内核解压发生在没有完整 C 运行库的环境。

## 六、常见误区
认为 bzImage 是 bz2 压缩，实际 b 指 big（可放高端内存），压缩算法由构建选择；认为 vmlinuz 与 vmlinux 同一文件，前者是压缩后的引导镜像；忽略解压 stub 也会被加载占用内存。

## 七、与开源书/权威来源对应
Bryant & O'Hallaron《CSAPP》第 7 章详解目标文件与链接，可对照 vmlinux 的 ELF 结构；Hansimov/csapp 提供实验性 loader 代码；Linux 内核 Documentation/x86/boot.rst 描述头字段。

## 八、面试题
vmlinux 与 bzImage 区别；为何需要解压 stub 自我搬移；压缩内核的取舍；ELF 头在启动中的角色。

## 九、演进与趋势
zstd 等更快解压算法被采用以缩短启动时间；统一内核镜像（UKI）把内核、initrd、cmdline 打包成单签名的 PE 文件以利 Secure Boot。

## 十、小结
内核镜像格式在传输体积与启动复杂度之间权衡，bzImage 通过内置解压 stub 在受限环境把压缩内核还原到运行地址，是引导加载器与内核之间的契约实现。
