# 字符设备驱动注册与file_operations

> 对应 Corbet、Rubini & Kroah-Hartman《Linux Device Drivers》（LDD3）第 3 章 Char Drivers 与 Kerrisk《The Linux Programming Interface》第 30 章 Device Special Files；并参考内核文档 `Documentation/filesystems/vfs.rst`。

## 一、背景与挑战

字符设备（如串口、键盘、传感器、各类流式外设）以字节流方式被访问，不按扇区寻址，也不经块层调度。

驱动需向内核「注册」一个主/次设备号，并把 `file_operations` 表挂上，使 `open/read/write/ioctl` 最终落到驱动代码。

挑战在于：设备号分配要与 `/dev` 节点创建协同；VFS 路径要正确把文件操作分发到驱动的 `f_op` 回调；用户指针须经安全拷贝。

## 二、核心原理

`alloc_chrdev_region` 向内核申请一段设备号（或 `register_chrdev_region` 用静态号）；`cdev_init` 把 `file_operations` 绑到 `cdev`，`cdev_add` 把 `cdev` 加入系统。

`/dev` 下节点由 udev 据 uevent 创建，其 `inode` 的 `i_rdev` 指向设备号。VFS 打开时据 `i_rdev` 找到 `cdev`，把 `inode->i_cdev`/设备号映射到 `file->f_op`。

此后 `vfs_read`/`vfs_write` 经 `file->f_op->read_iter`/`write_iter`（或旧 `read`/`write`）转入驱动。

`copy_to_user`/`copy_from_user` 在驱动与用户缓冲间安全搬运，并做地址校验与缺页处理。

## 三、形式化与数学基础

设备号编码（32 位 `dev_t`）：

$$dev\_t = (major \ll 20) \mid minor$$

主设备号标识驱动，次设备号标识同驱动下具体实例。

字符设备查找是无向分发：打开路径 $open(inode) \to cdev = chrdevs[major].cdev \to file{\to}f\_op = cdev{\to}ops$。

`read` 返回字节数满足 $0 \le ret \le count$，返回 0 表示 EOF（对流式设备常表示暂时无数据）。

## 四、代码实现

```c
static struct file_operations fops = {
    .owner  = THIS_MODULE,
    .open   = dev_open,
    .read   = dev_read,
    .write  = dev_write,
    .unlocked_ioctl = dev_ioctl,   // 现代用 unlocked_ioctl
};

static int __init drv_init(void) {
    alloc_chrdev_region(&devno, 0, 1, "mydev"); // 动态分配主设备号
    cdev_init(&cdev, &fops);
    cdev_add(&cdev, devno, 1);                  // 加入字符设备表
    device_create(cls, NULL, devno, NULL, "mydev%d", 0); // 触发 uevent 建节点
    return 0;
}
```

`read` 内须用 `copy_to_user(buf, kbuf, n)` 返回剩余未拷贝字节数（0 表示成功）。

## 五、与其他技术对比

| 维度 | 字符设备 | 块设备 | misc 设备 |
| --- | --- | --- | --- |
| 寻址 | 字节流 | 扇区 | 字节流 |
| 缓冲/调度 | 无 | 有（电梯） | 无 |
| 注册 | cdev | gendisk+队列 | misc_register（主号 10） |

字符设备无缓冲区概念、随机访问弱；块设备以扇区寻址并走请求队列。

相较 misc 设备（简化主设备号 10），标准 cdev 更灵活，可自管设备号区间。

## 六、常见误区

1. 误以为 `read` 必须返回请求字节数：可返回少于请求（短读），返回 0 表 EOF/无数据。
2. 误以为 `ioctl` 可随意定义命令码：须用 `_IO`/`_IOR`/`_IOW`/`_IOWR` 宏编码方向/大小/类型，避免冲突。
3. 误以为 `copy_to_user` 可省：用户指针须经它校验拷贝，直接解引用会触发缺页或越权。
4. 误以为 `open` 总是成功：须检查设备忙/权限，返回 `-EBUSY`/`-EPERM` 等负错。
5. 误以为 `write` 同步落设备：许多字符设备内部缓冲，`sync`/刷新语义由设备定。

## 七、与开源书·权威来源对应

- Corbet LDD3 第 3 章讲字符设备注册（`register_chrdev`、`cdev_add`）与 `file_operations`。
- Kerrisk《TLPI》第 30 章讲设备特殊文件、`dev_t`、主次号与 `ioctl` 约定。
- 内核 `vfs.rst` 描述 `file_operations` 在 VFS 中的分发位置（`read_iter`/`write_iter`）。
- `Documentation/core-api/credentials.rst` 说明 `copy_to/from_user` 的访问检查前提。

## 八、面试题

1. 用户 `read` 到内核驱动经历什么？要点：VFS→cdev→f_op->read，驱动 `copy_to_user` 填用户缓冲。
2. 主/次设备号含义？要点：主标识驱动类，次标识实例；`dev_t` 为 12/20 位拆分。
3. 为何必须 `copy_to/from_user`？要点：用户指针不可信、可能缺页，须安全拷贝并返回剩余。
4. `unlocked_ioctl` 为何取代 `ioctl`？要点：去掉大内核锁（BKL），并发更安全。

## 九、演进与趋势

- `devtmpfs` 实现内核自创 `/dev` 节点，udev 转向规则化权限/符号链接。
- `ioctl` 渐被 `io_uring` 命令、`netlink` 与 `configfs` 替代，以减少拷贝与特权边界。
- 现代驱动多用 `read_iter`/`write_iter`（iov_iter）统一处理 vectored I/O。

## 十、小结

字符设备驱动 = 设备号注册 + cdev + file_operations，是用户态字节流访问硬件的统一入口。

VFS 把 `open/read/write/ioctl` 分发到驱动回调，驱动经 `copy_to/from_user` 安全桥接用户与内核，构成字符设备子系统的基础骨架。
