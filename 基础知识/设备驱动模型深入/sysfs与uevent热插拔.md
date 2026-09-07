# sysfs与uevent热插拔

> 对应 Corbet《Linux Device Drivers》第 14 章 sysfs 与 Love《Linux Kernel Development》第 17 章。

## 一、背景与挑战
用户态如何查看/调节内核设备属性？设备热插拔（U 盘、网卡）时用户态如何得知并自动建节点？sysfs 提供属性视图，uevent 提供内核→用户态事件通道。

## 二、核心原理
sysfs 是内存文件系统，把 kobject 层次导出为目录，属性以文件呈现，读触发 `show`、写触发 `store` 回调。kobject 状态变化（add/remove）经 `kobject_uevent` 发 `netlink` 广播（或 `/sys/kernel/uevent_helper`），udev 据此创建设备节点、加载固件。

## 三、形式化与数学基础
uevent 序列：
$$event \to kobject\_uevent(env) \to netlink(NLMSG) \to udevd \to mknod(/dev/x)$$
属性读写：$read \Rightarrow show(kobj,attr,buf)$；$write \Rightarrow store(kobj,attr,buf,len)$。单属性建议一值，避免解析歧义。

## 四、代码实现
```c
static ssize_t val_show(struct kobject *k, struct kobj_attribute *a, char *b) {
    return sprintf(b, "%d\n", my_val);
}
static struct kobj_attribute attr_val = __ATTR(val, 0644, val_show, val_store);
// kobject 加入 sysfs 后 /sys/.../val 可读写
```

## 五、与其他技术对比
procfs 偏进程/调试杂项；sysfs 强调"一个属性一文件"的结构化设备视图；configfs 允许用户态创建内核对象。相较 ioctl，sysfs 文本接口更易脚本化。

## 六、常见误区
误以为 sysfs 文件可放大块二进制：应单一小值。误以为 uevent 一定触发 udev：需用户态守护监听 netlink。误以为写 sysfs 即持久：多为运行时，重启失效。

## 七、与开源书/权威来源对应
Corbet LDD 第 14 章 sysfs 属性与 uevent；OSTEP 设备章与内核文档 `driver-model`。

## 八、面试题
问：插 U 盘后 /dev/sdX 怎么来的？答：内核发 uevent，udev 据规则 mknod。问：sysfs 与 procfs 区别？

## 九、演进与趋势
udev 并入 systemd，规则引擎更强；devtmpfs 内核预建节点，用户态仅做权限/符号链接。

## 十、小结
sysfs + uevent 把内核设备对象与事件暴露给用户态，是热插拔与设备配置自动化的支柱。
