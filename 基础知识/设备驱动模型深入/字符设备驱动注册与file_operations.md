# 字符设备驱动注册与file_operations

> 对应 Corbet《Linux Device Drivers》第 3 章字符设备与 Kerrisk《The Linux Programming Interface》第 30 章。

## 一、背景与挑战
字符设备（如串口、键盘、传感器）以字节流方式被访问。驱动需向内核"注册"一个主/次设备号，并把 `file_operations` 表挂上，使 `open/read/write/ioctl` 落到驱动代码。

## 二、核心原理
`alloc_chrdev_region` 分配设备号，`cdev_init` 绑定 `file_operations`，`cdev_add` 加入系统。`/dev` 下节点由 udev 据 uevent 创建，其 `inode` 的 `i_rdev` 指向设备号，VFS 打开时找到 `cdev` 并填入 `file->f_op`。

## 三、形式化与数学基础
设备号编码：
$$dev\_t = (major \ll 20) \mid minor$$
主设备号标识驱动，次设备号标识同驱动下具体实例。字符设备查找：$open(inode) \to cdev = chrdevs[major].cdev \to file->f\_op = cdev->ops$。

## 四、代码实现
```c
static struct file_operations fops = {
    .open = dev_open, .read = dev_read, .write = dev_write,
};
static int __init drv_init(void) {
    alloc_chrdev_region(&devno, 0, 1, "mydev");
    cdev_init(&cdev, &fops);
    cdev_add(&cdev, devno, 1);
    return 0;
}
```

## 五、与其他技术对比
字符设备无缓冲区概念、随机访问弱；块设备以扇区寻址并走请求队列。相较 misc 设备（简化主设备号 10），标准 cdev 更灵活。

## 六、常见误区
误以为 `read` 必须返回请求字节数：可返回少于请求（短读）并返回 0 表 EOF。误以为 `ioctl` 可随意定义：命令码需符合 `_IO` 宏编码方向/大小。误以为 `copy_to_user` 可省：用户指针须经它校验拷贝。

## 七、与开源书/权威来源对应
Corbet LDD 第 3 章字符设备注册；Kerrisk 第 30 章设备特殊文件与 ioctl。

## 八、面试题
问：用户 `read` 到内核驱动经历了什么？答：VFS→cdev→f_op->read，驱动 `copy_to_user` 填用户缓冲。问：主/次设备号含义？

## 九、演进与趋势
`devtmpfs` 实现内核自创 `/dev` 节点，udev 转向规则化；`ioctl` 渐被 `io_uring` 与 netlink 替代以减少拷贝。

## 十、小结
字符设备驱动 = 设备号注册 + cdev + file_operations，是用户态字节流访问硬件的统一入口。
